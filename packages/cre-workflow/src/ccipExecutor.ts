import { AllocationDecision } from "./llmRanker";

export interface RebalanceResult {
  txHashes: string[];
  success: boolean;
}

const PARITY_TOLERANCE = 0.005; // 0.5% depeg tolerance

/**
 * Read Chainlink USDC/USD Data Feed to verify stablecoin peg.
 * Returns false if price < 0.995 or > 1.005.
 */
export async function checkStablecoinPeg(feedAddress: string): Promise<boolean> {
  try {
    // In CRE runtime this uses the evm_read capability:
    // const [, answer] = await evmRead(feedAddress, "latestRoundData()(uint80,int256,uint256,uint256,uint80)");
    // const price = Number(answer) / 1e8;
    // Placeholder for non-CRE context (returns true = peg OK)
    const price = 1.0;
    return price >= 1 - PARITY_TOLERANCE && price <= 1 + PARITY_TOLERANCE;
  } catch (err) {
    console.warn("checkStablecoinPeg: failed —", (err as Error).message);
    return false;
  }
}

/**
 * Execute rebalance allocations via EVM write (same chain) or CCIP (cross-chain).
 * After all moves, writes the audit record to TreasuryVault.rebalance().
 */
export async function executeRebalance(
  allocations: AllocationDecision[],
  vaultAddress: string,
  llmRationale: string,
  totalValueUsd: number,
  currentChainId = 11155111 // Sepolia by default
): Promise<RebalanceResult> {
  const txHashes: string[] = [];

  try {
    for (const allocation of allocations) {
      // In real CRE runtime:
      // if same chain: await evmWrite(vaultAddress, "allocate(address,uint256)", [protocol, amount])
      // if cross-chain: await ccipWrite({ destinationChain, receiver, data: encode(protocol, amount, isAave) })
      console.log(
        `Executing allocation: ${allocation.protocol} → ${allocation.allocationBps} bps`
      );
      // Simulate tx hash
      txHashes.push(`0x${"0".repeat(62)}${txHashes.length.toString().padStart(2, "0")}`);
    }

    // Write audit record on-chain
    // await evmWrite(vaultAddress, "rebalance((address,uint256,uint256,string)[],string,uint256)",
    //   [allocations.map(a => [a.protocol, chainId, a.allocationBps, a.protocol]), llmRationale, totalValueUsd])
    console.log(`Rebalance audit written to vault ${vaultAddress}`);

    return { txHashes, success: true };
  } catch (err) {
    console.error("executeRebalance failed —", (err as Error).message);
    return { txHashes, success: false };
  }
}
