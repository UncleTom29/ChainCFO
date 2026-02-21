// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/*
 * SECURITY CHECKLIST:
 * [x] onlyOwner for governor management
 * [x] onlyGovernor for proposal and voting
 * [x] Majority vote required for execution
 * [x] GovernanceVoteExecuted is the CRE EVM Log Trigger event
 * [x] All state changes emit events
 * [x] Input validation: address != address(0)
 * [x] NatSpec on all functions
 */

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernancePolicy
 * @notice On-chain policy governance for ChainCFO. Governors propose and vote on
 *         treasury policy parameters. When a proposal reaches majority, it is executed
 *         and the GovernanceVoteExecuted event fires — which acts as the CRE EVM Log Trigger.
 * @dev Inherits OpenZeppelin Ownable.
 */
contract GovernancePolicy is Ownable {

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Policy {
        uint256 maxAllocationBps;        // Maximum allocation per protocol in basis points
        uint256 minLiquidityBufferBps;   // Minimum liquidity buffer in basis points
        uint256 maxProtocols;            // Maximum number of protocols
        uint256 rebalanceIntervalSecs;   // Minimum seconds between rebalances
        bool    requireProofOfReserve;   // Whether PoR check is required
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The currently active policy parameters.
    Policy public currentPolicy;

    /// @notice Whether an address is a governor.
    mapping(address => bool) public governors;

    /// @notice Number of governors (for majority calculation).
    uint256 public governorCount;

    /// @notice Proposed policies by proposal ID.
    mapping(uint256 => Policy) public proposals;

    /// @notice Proposal proposer.
    mapping(uint256 => address) public proposalProposer;

    /// @notice Whether a governor has voted for a proposal.
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @notice Vote count per proposal.
    mapping(uint256 => uint256) public voteCount;

    /// @notice Whether a proposal has been executed.
    mapping(uint256 => bool) public proposalExecuted;

    /// @notice Auto-incrementing proposal ID.
    uint256 public nextProposalId;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new policy proposal is created.
     */
    event GovernancePolicyProposed(uint256 indexed proposalId, address indexed proposer, Policy policy);

    /**
     * @notice Emitted when a governor votes on a proposal.
     */
    event GovernanceVoteCast(uint256 indexed proposalId, address indexed voter);

    /**
     * @notice CRITICAL: This event is the CRE EVM Log Trigger. When emitted,
     *         the Chainlink CRE workflow is triggered to rebalance the vault.
     */
    event GovernanceVoteExecuted(uint256 indexed proposalId, Policy policy);

    event GovernorAdded(address indexed governor);
    event GovernorRemoved(address indexed governor);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyGovernor() {
        require(governors[msg.sender], "GovernancePolicy: not a governor");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploy with default policy parameters.
     */
    constructor() Ownable(msg.sender) {
        currentPolicy = Policy({
            maxAllocationBps: 5000,
            minLiquidityBufferBps: 500,
            maxProtocols: 5,
            rebalanceIntervalSecs: 14400,
            requireProofOfReserve: false
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governor functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create a new policy proposal.
     * @param  policy The proposed policy parameters.
     * @return proposalId The ID of the newly created proposal.
     */
    function proposePolicy(Policy calldata policy) external onlyGovernor returns (uint256 proposalId) {
        require(policy.maxAllocationBps > 0 && policy.maxAllocationBps <= 10000,
            "GovernancePolicy: invalid maxAllocationBps");
        require(policy.minLiquidityBufferBps < 10000,
            "GovernancePolicy: invalid minLiquidityBufferBps");
        require(policy.maxProtocols > 0, "GovernancePolicy: maxProtocols must be > 0");
        require(policy.rebalanceIntervalSecs > 0, "GovernancePolicy: rebalanceInterval must be > 0");

        proposalId = nextProposalId++;
        proposals[proposalId] = policy;
        proposalProposer[proposalId] = msg.sender;

        emit GovernancePolicyProposed(proposalId, msg.sender, policy);
    }

    /**
     * @notice Vote in favour of a proposal. Each governor may vote once.
     * @param  proposalId The ID of the proposal to vote for.
     */
    function votePolicy(uint256 proposalId) external onlyGovernor {
        require(proposalId < nextProposalId, "GovernancePolicy: proposal does not exist");
        require(!hasVoted[proposalId][msg.sender], "GovernancePolicy: already voted");
        require(!proposalExecuted[proposalId], "GovernancePolicy: already executed");

        hasVoted[proposalId][msg.sender] = true;
        voteCount[proposalId]++;

        emit GovernanceVoteCast(proposalId, msg.sender);
    }

    /**
     * @notice Execute a proposal that has reached majority votes.
     * @dev    Emits GovernanceVoteExecuted, which is the CRE EVM Log Trigger.
     * @param  proposalId The ID of the proposal to execute.
     */
    function executePolicy(uint256 proposalId) external onlyGovernor {
        require(proposalId < nextProposalId, "GovernancePolicy: proposal does not exist");
        require(!proposalExecuted[proposalId], "GovernancePolicy: already executed");
        require(governorCount > 0, "GovernancePolicy: no governors");
        require(
            voteCount[proposalId] * 2 > governorCount,
            "GovernancePolicy: insufficient votes for majority"
        );

        proposalExecuted[proposalId] = true;
        currentPolicy = proposals[proposalId];

        emit GovernanceVoteExecuted(proposalId, currentPolicy);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Add a new governor.
     * @param  governor Address to grant governor role.
     */
    function addGovernor(address governor) external onlyOwner {
        require(governor != address(0), "GovernancePolicy: zero address");
        require(!governors[governor], "GovernancePolicy: already a governor");
        governors[governor] = true;
        governorCount++;
        emit GovernorAdded(governor);
    }

    /**
     * @notice Remove an existing governor.
     * @param  governor Address to revoke governor role.
     */
    function removeGovernor(address governor) external onlyOwner {
        require(governors[governor], "GovernancePolicy: not a governor");
        governors[governor] = false;
        governorCount--;
        emit GovernorRemoved(governor);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Return the currently active policy.
     * @return The current Policy struct.
     */
    function getPolicy() external view returns (Policy memory) {
        return currentPolicy;
    }
}
