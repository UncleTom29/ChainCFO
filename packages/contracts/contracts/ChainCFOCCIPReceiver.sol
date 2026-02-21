// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/*
 * SECURITY CHECKLIST:
 * [x] Inherits CCIPReceiver (only CCIP router can call _ccipReceive)
 * [x] onlyOwner emergencyWithdraw
 * [x] Input validation: amount > 0, destinationProtocol != address(0)
 * [x] SafeERC20 for token transfers
 * [x] All state changes emit events
 * [x] NatSpec on all fund-handling functions
 */

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ILendingPool {
    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
}

interface ICToken {
    function mint(uint256 mintAmount) external returns (uint256);
}

/**
 * @title ChainCFOCCIPReceiver
 * @notice Receives cross-chain stablecoin messages via Chainlink CCIP and
 *         deposits the funds into the designated lending protocol (Aave or Compound).
 * @dev Inherits Chainlink CCIPReceiver and OpenZeppelin Ownable.
 */
contract ChainCFOCCIPReceiver is CCIPReceiver, Ownable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The stablecoin this receiver handles (e.g. USDC).
    address public immutable stablecoin;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event CrossChainDeposited(
        bytes32 indexed messageId,
        address indexed destinationProtocol,
        uint256 amount
    );
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param router     Address of the Chainlink CCIP router on this chain.
     * @param _stablecoin Address of the stablecoin ERC-20 token.
     */
    constructor(address router, address _stablecoin)
        CCIPReceiver(router)
        Ownable(msg.sender)
    {
        require(router != address(0), "ChainCFOCCIPReceiver: zero router address");
        require(_stablecoin != address(0), "ChainCFOCCIPReceiver: zero stablecoin address");
        stablecoin = _stablecoin;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CCIP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Handle an incoming CCIP message by depositing stablecoin into the target protocol.
     * @dev    @audit Fund-handling: called only by the CCIP router (CCIPReceiver enforces this).
     *         Decodes (destinationProtocol, amount, isAave) from message data.
     *         For Aave: calls ILendingPool.deposit().
     *         For Compound: calls ICToken.mint().
     * @param  message The CCIP Any2EVMMessage received from the router.
     */
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        (address destinationProtocol, uint256 amount, bool isAave) =
            abi.decode(message.data, (address, uint256, bool));

        require(destinationProtocol != address(0), "ChainCFOCCIPReceiver: zero protocol address");
        require(amount > 0, "ChainCFOCCIPReceiver: amount must be > 0");

        IERC20(stablecoin).forceApprove(destinationProtocol, amount);

        if (isAave) {
            ILendingPool(destinationProtocol).deposit(stablecoin, amount, address(this), 0);
        } else {
            ICToken(destinationProtocol).mint(amount);
        }

        emit CrossChainDeposited(message.messageId, destinationProtocol, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emergency withdrawal of any ERC-20 token held by this contract.
     * @dev    @audit Fund-handling: onlyOwner, emits event.
     * @param  token  Address of the ERC-20 token to withdraw.
     * @param  to     Recipient address.
     * @param  amount Amount to withdraw.
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "ChainCFOCCIPReceiver: zero token address");
        require(to != address(0), "ChainCFOCCIPReceiver: zero recipient address");
        require(amount > 0, "ChainCFOCCIPReceiver: amount must be > 0");
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }
}
