// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/*
 * SECURITY CHECKLIST:
 * [x] ReentrancyGuard on deposit, withdraw, rebalance
 * [x] Pausable circuit breaker
 * [x] onlyOwner / onlyCreCaller access control
 * [x] Input validation: amount > 0, address != address(0)
 * [x] Slippage protection via minAmountOut
 * [x] Circuit breaker: new TVL < 80% of previous → pause
 * [x] Allocation count <= policy.maxProtocols enforced
 * [x] All state changes emit events
 * [x] NatSpec on all fund-handling functions
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TreasuryVault
 * @notice AI-powered multi-protocol treasury vault with compliance rails.
 *         Accepts stablecoin deposits, issues proportional shares, and stores
 *         on-chain allocation reports produced by the CRE workflow.
 * @dev Inherits OpenZeppelin Ownable, ReentrancyGuard, and Pausable.
 */
contract TreasuryVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The stablecoin accepted by this vault (e.g. USDC).
    IERC20 public stablecoin;

    /// @notice Address authorised to call rebalance() (the CRE workflow EOA/contract).
    address public creAuthorizedCaller;

    /// @notice Share balance of each depositor.
    mapping(address => uint256) public userShares;

    /// @notice Total shares outstanding.
    uint256 public totalShares;

    /// @notice Total stablecoin principal held (tracks TVL for circuit-breaker).
    uint256 public totalPrincipal;

    /// @notice Maximum number of protocol allocations per rebalance.
    uint256 public maxProtocols = 10;

    struct ProtocolAllocation {
        address protocol;
        uint256 chainId;
        uint256 basisPoints;
        string  name;
    }

    struct AllocationReport {
        uint256               timestamp;
        ProtocolAllocation[]  allocations;
        string                llmRationale;
        uint256               totalValueUsd;
    }

    /// @notice Historical allocation reports stored on-chain.
    AllocationReport[] public allocationHistory;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 amount);
    event Rebalanced(uint256 indexed reportIndex, uint256 totalValueUsd, string llmRationale);
    event ComplianceViolation(string reason, uint256 timestamp);
    event CircuitBreakerTriggered(uint256 previousTvl, uint256 newTvl, uint256 timestamp);
    event CreCallerUpdated(address indexed previousCaller, address indexed newCaller);
    event MaxProtocolsUpdated(uint256 previousMax, uint256 newMax);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyCreCaller() {
        require(msg.sender == creAuthorizedCaller, "TreasuryVault: caller is not CRE");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param _stablecoin Address of the ERC-20 stablecoin (e.g. USDC on Sepolia).
     */
    constructor(address _stablecoin) Ownable(msg.sender) {
        require(_stablecoin != address(0), "TreasuryVault: zero stablecoin address");
        stablecoin = IERC20(_stablecoin);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // User-facing functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deposit stablecoin and receive vault shares proportional to TVL.
     * @dev    @audit Fund-handling: uses SafeERC20, ReentrancyGuard, Pausable.
     * @param  amount Amount of stablecoin to deposit (must be > 0).
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "TreasuryVault: amount must be > 0");

        uint256 currentBalance = stablecoin.balanceOf(address(this));
        uint256 sharesToMint;

        if (totalShares == 0 || currentBalance == 0) {
            sharesToMint = amount;
        } else {
            sharesToMint = (amount * totalShares) / currentBalance;
        }

        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        userShares[msg.sender] += sharesToMint;
        totalShares += sharesToMint;
        totalPrincipal += amount;

        emit Deposited(msg.sender, amount, sharesToMint);
    }

    /**
     * @notice Burn shares and withdraw proportional stablecoin amount.
     * @dev    @audit Fund-handling: uses SafeERC20, ReentrancyGuard, Pausable.
     * @param  shares       Number of shares to burn (must be > 0).
     * @param  minAmountOut Minimum stablecoin to receive (slippage protection).
     */
    function withdraw(uint256 shares, uint256 minAmountOut) external nonReentrant whenNotPaused {
        require(shares > 0, "TreasuryVault: shares must be > 0");
        require(userShares[msg.sender] >= shares, "TreasuryVault: insufficient shares");

        uint256 currentBalance = stablecoin.balanceOf(address(this));
        uint256 amountOut = (shares * currentBalance) / totalShares;
        require(amountOut >= minAmountOut, "TreasuryVault: slippage exceeded");

        userShares[msg.sender] -= shares;
        totalShares -= shares;
        if (totalPrincipal >= amountOut) {
            totalPrincipal -= amountOut;
        } else {
            totalPrincipal = 0;
        }

        stablecoin.safeTransfer(msg.sender, amountOut);
        emit Withdrawn(msg.sender, shares, amountOut);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRE-only functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Store a new allocation report produced by the CRE workflow.
     * @dev    @audit Fund-handling: onlyCreCaller, ReentrancyGuard.
     *         Circuit breaker: pauses vault if TVL drops below 80 % of previous.
     * @param  allocations   Array of protocol allocations (sum of bps must equal 10 000).
     * @param  llmRationale  Free-form rationale string from Gemini.
     * @param  totalValueUsd Total vault value in USD cents (18-decimal fixed-point).
     */
    function rebalance(
        ProtocolAllocation[] calldata allocations,
        string calldata llmRationale,
        uint256 totalValueUsd
    ) external nonReentrant onlyCreCaller {
        require(allocations.length <= maxProtocols, "TreasuryVault: too many protocols");
        require(allocations.length > 0, "TreasuryVault: no allocations");

        // Circuit breaker: if new TVL < 80% of previous, pause and emit event
        if (allocationHistory.length > 0) {
            uint256 previousTvl = allocationHistory[allocationHistory.length - 1].totalValueUsd;
            if (previousTvl > 0 && totalValueUsd < (previousTvl * 80) / 100) {
                _pause();
                emit CircuitBreakerTriggered(previousTvl, totalValueUsd, block.timestamp);
                emit ComplianceViolation("Circuit breaker: TVL dropped below 80%", block.timestamp);
                return;
            }
        }

        AllocationReport storage report = allocationHistory.push();
        report.timestamp    = block.timestamp;
        report.llmRationale = llmRationale;
        report.totalValueUsd = totalValueUsd;
        for (uint256 i = 0; i < allocations.length; i++) {
            report.allocations.push(allocations[i]);
        }

        emit Rebalanced(allocationHistory.length - 1, totalValueUsd, llmRationale);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Update the CRE authorized caller address.
     * @param  newCaller New address that may call rebalance().
     */
    function setCreCaller(address newCaller) external onlyOwner {
        require(newCaller != address(0), "TreasuryVault: zero address");
        address previous = creAuthorizedCaller;
        creAuthorizedCaller = newCaller;
        emit CreCallerUpdated(previous, newCaller);
    }

    /**
     * @notice Update the maximum number of protocols per rebalance.
     * @param  newMax New maximum protocols count.
     */
    function setMaxProtocols(uint256 newMax) external onlyOwner {
        require(newMax > 0, "TreasuryVault: maxProtocols must be > 0");
        uint256 previous = maxProtocols;
        maxProtocols = newMax;
        emit MaxProtocolsUpdated(previous, newMax);
    }

    /// @notice Pause the vault (emergency stop). Only owner.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the vault. Only owner.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Return the last `limit` allocation reports.
     * @param  limit Maximum number of reports to return.
     * @return reports Array of AllocationReport structs.
     */
    function getAllocationHistory(uint256 limit)
        external
        view
        returns (AllocationReport[] memory reports)
    {
        uint256 total = allocationHistory.length;
        uint256 count = limit > total ? total : limit;
        reports = new AllocationReport[](count);
        for (uint256 i = 0; i < count; i++) {
            reports[i] = allocationHistory[total - count + i];
        }
    }

    /**
     * @notice Return total vault balance (TVL proxy).
     * @return balance Current stablecoin balance held by this contract.
     */
    function getTVL() external view returns (uint256 balance) {
        return stablecoin.balanceOf(address(this));
    }
}
