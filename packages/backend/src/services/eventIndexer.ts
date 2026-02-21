import { ethers } from "ethers";
import { prisma } from "../db";
import { logger } from "../logger";
import { rebalanceCounter } from "../metrics";

const VAULT_ABI = [
  "event Deposited(address indexed user, uint256 amount, uint256 shares)",
  "event Withdrawn(address indexed user, uint256 shares, uint256 amount)",
  "event Rebalanced(uint256 indexed reportIndex, uint256 totalValueUsd, string llmRationale)",
  "event ComplianceViolation(string reason, uint256 timestamp)",
];

const GOV_ABI = [
  "event GovernancePolicyProposed(uint256 indexed proposalId, address indexed proposer, tuple(uint256 maxAllocationBps, uint256 minLiquidityBufferBps, uint256 maxProtocols, uint256 rebalanceIntervalSecs, bool requireProofOfReserve) policy)",
  "event GovernanceVoteExecuted(uint256 indexed proposalId, tuple(uint256 maxAllocationBps, uint256 minLiquidityBufferBps, uint256 maxProtocols, uint256 rebalanceIntervalSecs, bool requireProofOfReserve) policy)",
];

const MAX_RECONNECT_DELAY_MS = 30000;

async function connectWithBackoff(
  wsUrl: string,
  attempt = 0
): Promise<ethers.WebSocketProvider> {
  const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY_MS);
  if (attempt > 0) {
    logger.info(`Reconnecting WebSocket in ${delay}ms (attempt ${attempt})`);
    await new Promise((r) => setTimeout(r, delay));
  }
  return new ethers.WebSocketProvider(wsUrl);
}

export async function subscribeToVaultEvents(
  vaultAddress: string,
  wsUrl: string
): Promise<void> {
  let attempt = 0;

  async function subscribe() {
    const provider = await connectWithBackoff(wsUrl, attempt);
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

    vault.on("Deposited", async (user, amount, shares, event) => {
      try {
        await prisma.treasuryEvent.create({
          data: {
            eventType: "DEPOSIT",
            txHash: event.log.transactionHash,
            amount: amount.toString(),
            userAddress: user,
            chainId: 11155111,
          },
        });
        logger.info("Indexed Deposited event", { user, amount: amount.toString() });
      } catch (err) {
        logger.error("Error indexing Deposited", { error: (err as Error).message });
      }
    });

    vault.on("Withdrawn", async (user, shares, amount, event) => {
      try {
        await prisma.treasuryEvent.create({
          data: {
            eventType: "WITHDRAWAL",
            txHash: event.log.transactionHash,
            amount: amount.toString(),
            userAddress: user,
            chainId: 11155111,
          },
        });
        logger.info("Indexed Withdrawn event", { user, amount: amount.toString() });
      } catch (err) {
        logger.error("Error indexing Withdrawn", { error: (err as Error).message });
      }
    });

    vault.on(
      "Rebalanced",
      async (reportIndex, totalValueUsd, llmRationale, event) => {
        try {
          await prisma.allocationReport.create({
            data: {
              totalValueUsd: Number(totalValueUsd),
              llmRationale,
              txHash: event.log.transactionHash,
            },
          });
          rebalanceCounter.inc();
          logger.info("Indexed Rebalanced event", { reportIndex: reportIndex.toString() });
        } catch (err) {
          logger.error("Error indexing Rebalanced", { error: (err as Error).message });
        }
      }
    );

    vault.on("ComplianceViolation", async (reason, timestamp, event) => {
      try {
        await prisma.treasuryEvent.create({
          data: {
            eventType: "COMPLIANCE_VIOLATION",
            txHash: event.log.transactionHash,
            amount: "0",
            userAddress: vaultAddress,
            chainId: 11155111,
          },
        });
        logger.warn("Indexed ComplianceViolation", { reason });
      } catch (err) {
        logger.error("Error indexing ComplianceViolation", { error: (err as Error).message });
      }
    });

    (provider.websocket as any).onclose = () => {
      logger.warn("WebSocket closed, reconnecting...");
      attempt++;
      subscribe().catch((err) =>
        logger.error("Failed to reconnect", { error: (err as Error).message })
      );
    };

    logger.info("Subscribed to vault events", { vaultAddress });
  }

  await subscribe();
}

export async function subscribeToGovernanceEvents(
  govAddress: string,
  wsUrl: string
): Promise<void> {
  const provider = await connectWithBackoff(wsUrl);
  const governance = new ethers.Contract(govAddress, GOV_ABI, provider);

  governance.on("GovernancePolicyProposed", async (proposalId, proposer, policy, event) => {
    try {
      await prisma.treasuryEvent.create({
        data: {
          eventType: "GOVERNANCE_PROPOSED",
          txHash: event.log.transactionHash,
          amount: proposalId.toString(),
          userAddress: proposer,
          chainId: 11155111,
        },
      });
      logger.info("Indexed GovernancePolicyProposed", { proposalId: proposalId.toString() });
    } catch (err) {
      logger.error("Error indexing GovernancePolicyProposed", { error: (err as Error).message });
    }
  });

  governance.on("GovernanceVoteExecuted", async (proposalId, policy, event) => {
    try {
      await prisma.treasuryEvent.create({
        data: {
          eventType: "GOVERNANCE_EXECUTED",
          txHash: event.log.transactionHash,
          amount: proposalId.toString(),
          userAddress: govAddress,
          chainId: 11155111,
        },
      });
      logger.info("Indexed GovernanceVoteExecuted", { proposalId: proposalId.toString() });
    } catch (err) {
      logger.error("Error indexing GovernanceVoteExecuted", { error: (err as Error).message });
    }
  });

  logger.info("Subscribed to governance events", { govAddress });
}

export async function startIndexer(): Promise<void> {
  const wsUrl = process.env.SEPOLIA_RPC_URL?.replace("https://", "wss://").replace("http://", "ws://") || "";
  const vaultAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "";
  const govAddress = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS || "";

  if (!wsUrl || !vaultAddress || !govAddress) {
    logger.warn("Indexer not started: missing env vars (SEPOLIA_RPC_URL, NEXT_PUBLIC_TREASURY_ADDRESS, NEXT_PUBLIC_GOVERNANCE_ADDRESS)");
    return;
  }

  try {
    await subscribeToVaultEvents(vaultAddress, wsUrl);
    await subscribeToGovernanceEvents(govAddress, wsUrl);
    logger.info("Event indexer started");
  } catch (err) {
    logger.error("Failed to start indexer", { error: (err as Error).message });
  }
}
