export const TREASURY_VAULT_ADDRESS =
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS as `0x${string}` | undefined;

export const GOVERNANCE_POLICY_ADDRESS =
  process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS as `0x${string}` | undefined;

export const TREASURY_VAULT_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "minAmountOut", type: "uint256" },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getTVL",
    outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalShares",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "userShares",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const GOVERNANCE_POLICY_ABI = [
  {
    inputs: [],
    name: "getPolicy",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "maxAllocationBps", type: "uint256" },
          { internalType: "uint256", name: "minLiquidityBufferBps", type: "uint256" },
          { internalType: "uint256", name: "maxProtocols", type: "uint256" },
          { internalType: "uint256", name: "rebalanceIntervalSecs", type: "uint256" },
          { internalType: "bool", name: "requireProofOfReserve", type: "bool" },
        ],
        internalType: "struct GovernancePolicy.Policy",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "uint256", name: "maxAllocationBps", type: "uint256" },
          { internalType: "uint256", name: "minLiquidityBufferBps", type: "uint256" },
          { internalType: "uint256", name: "maxProtocols", type: "uint256" },
          { internalType: "uint256", name: "rebalanceIntervalSecs", type: "uint256" },
          { internalType: "bool", name: "requireProofOfReserve", type: "bool" },
        ],
        internalType: "struct GovernancePolicy.Policy",
        name: "policy",
        type: "tuple",
      },
    ],
    name: "proposePolicy",
    outputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "votePolicy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "executePolicy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
