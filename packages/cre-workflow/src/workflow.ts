import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { fetchAllProtocols } from "./fetchers";
import { fetchCredoraRisk, fetchProofOfReserve } from "./riskEngine";
import { rankAllocations, validateCompliance, AllocationResult } from "./llmRanker";
import { checkStablecoinPeg, executeRebalance } from "./ccipExecutor";

interface WorkflowTrigger {
  type: "cron" | "evm_log";
  timestamp?: number;
}

interface GovernancePolicy {
  maxAllocationBps: number;
  minLiquidityBufferBps: number;
  maxProtocols: number;
  rebalanceIntervalSecs: number;
  requireProofOfReserve: boolean;
}

interface WorkflowResult {
  allocations: AllocationResult | null;
  txHashes: string[];
  llmRationale: string;
  timestamp: number;
  skipped?: boolean;
  skipReason?: string;
}

// NOTE: Module-level state does not persist across CRE workflow executions (each run is stateless).
// This variable only prevents duplicate rebalances within a single long-running process (e.g., dev/local).
// In production CRE, use on-chain storage (e.g., evmRead lastRebalanceTimestamp from the vault contract).
let lastRebalanceTimestamp = 0;

async function getGovernancePolicy(): Promise<GovernancePolicy> {
  // In CRE runtime: const policy = await evmRead(govAddress, "getPolicy()(...)")
  // Defaults used here for non-CRE context
  return {
    maxAllocationBps: 5000,
    minLiquidityBufferBps: 500,
    maxProtocols: 5,
    rebalanceIntervalSecs: 14400,
    requireProofOfReserve: false,
  };
}

export async function runRebalanceWorkflow(trigger: WorkflowTrigger): Promise<WorkflowResult> {
  const startTime = Date.now();
  console.log(JSON.stringify({ step: "workflow_start", trigger, timestamp: startTime }));

  // Step 1: Read governance policy
  let policy: GovernancePolicy;
  try {
    policy = await getGovernancePolicy();
    console.log(JSON.stringify({ step: "policy_read", policy, timestamp: Date.now() }));
  } catch (err) {
    console.error(JSON.stringify({ step: "policy_read", error: (err as Error).message, timestamp: Date.now() }));
    throw err;
  }

  // Step 2: Check rebalance interval for cron triggers
  if (trigger.type === "cron") {
    const elapsed = Math.floor(Date.now() / 1000) - lastRebalanceTimestamp;
    if (lastRebalanceTimestamp > 0 && elapsed < policy.rebalanceIntervalSecs) {
      const skipReason = `Skipping: ${elapsed}s elapsed, interval is ${policy.rebalanceIntervalSecs}s`;
      console.log(JSON.stringify({ step: "interval_check", skipped: true, elapsed, timestamp: Date.now() }));
      return { allocations: null, txHashes: [], llmRationale: "", timestamp: startTime, skipped: true, skipReason };
    }
  }

  // Step 3: Check stablecoin peg
  try {
    const feedAddress = process.env.CHAINLINK_DATA_FEED_USDC_USD ?? "";
    const pegOk = await checkStablecoinPeg(feedAddress);
    if (!pegOk) {
      const skipReason = "Aborting: USDC has depegged";
      console.warn(JSON.stringify({ step: "peg_check", depegged: true, timestamp: Date.now() }));
      return { allocations: null, txHashes: [], llmRationale: skipReason, timestamp: startTime, skipped: true, skipReason };
    }
    console.log(JSON.stringify({ step: "peg_check", pegOk: true, timestamp: Date.now() }));
  } catch (err) {
    console.error(JSON.stringify({ step: "peg_check", error: (err as Error).message, timestamp: Date.now() }));
    throw err;
  }

  // Step 4: Fetch protocol APY data
  let protocols;
  try {
    protocols = await fetchAllProtocols();
    console.log(JSON.stringify({ step: "protocols_fetched", count: protocols.length, timestamp: Date.now() }));
    if (protocols.length === 0) {
      throw new Error("No protocols available");
    }
  } catch (err) {
    console.error(JSON.stringify({ step: "fetch_protocols", error: (err as Error).message, timestamp: Date.now() }));
    throw err;
  }

  // Step 5: Fetch Credora risk scores via Confidential HTTP
  let riskScores;
  try {
    riskScores = await fetchCredoraRisk(protocols.map((p) => p.name));
    console.log(JSON.stringify({ step: "risk_scores_fetched", count: riskScores.length, timestamp: Date.now() }));
  } catch (err) {
    console.error(JSON.stringify({ step: "fetch_risk", error: (err as Error).message, timestamp: Date.now() }));
    throw err;
  }

  // Step 6: Proof of Reserve check (if required by policy)
  if (policy.requireProofOfReserve) {
    const verifiedProtocols = [];
    for (const p of protocols) {
      try {
        const porResult = await fetchProofOfReserve(p.contractAddress);
        if (porResult.verified) {
          verifiedProtocols.push(p);
        } else {
          console.warn(JSON.stringify({ step: "por_check", protocol: p.name, excluded: true, timestamp: Date.now() }));
        }
      } catch (err) {
        console.warn(JSON.stringify({ step: "por_check", protocol: p.name, error: (err as Error).message, timestamp: Date.now() }));
      }
    }
    protocols = verifiedProtocols;
    if (protocols.length === 0) {
      throw new Error("No protocols passed Proof of Reserve check");
    }
  }

  // Step 7: Rank allocations via Gemini LLM
  let allocationResult: AllocationResult;
  try {
    allocationResult = await rankAllocations(protocols, riskScores, {
      maxAllocationBps: policy.maxAllocationBps,
      minLiquidityBufferBps: policy.minLiquidityBufferBps,
      maxProtocols: policy.maxProtocols,
    });
    console.log(JSON.stringify({ step: "allocations_ranked", count: allocationResult.allocations.length, timestamp: Date.now() }));
  } catch (err) {
    console.error(JSON.stringify({ step: "rank_allocations", error: (err as Error).message, timestamp: Date.now() }));
    throw err;
  }

  // Step 8: Validate compliance
  const complianceResult = validateCompliance(allocationResult.allocations, {
    maxAllocationBps: policy.maxAllocationBps,
    minLiquidityBufferBps: policy.minLiquidityBufferBps,
    maxProtocols: policy.maxProtocols,
  });

  if (!complianceResult.compliant) {
    console.warn(JSON.stringify({
      step: "compliance_check",
      violations: complianceResult.violations,
      timestamp: Date.now(),
    }));
    return {
      allocations: allocationResult,
      txHashes: [],
      llmRationale: allocationResult.llmRationale,
      timestamp: startTime,
      skipped: true,
      skipReason: `Compliance violations: ${complianceResult.violations.join("; ")}`,
    };
  }
  console.log(JSON.stringify({ step: "compliance_check", compliant: true, timestamp: Date.now() }));

  // Step 9: Execute rebalance via CCIP
  const vaultAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "";
  let rebalanceResult;
  try {
    rebalanceResult = await executeRebalance(
      allocationResult.allocations,
      vaultAddress,
      allocationResult.llmRationale,
      allocationResult.allocations.reduce((sum, a) => sum + a.allocationBps, 0)
    );
    console.log(JSON.stringify({ step: "rebalance_executed", txHashes: rebalanceResult.txHashes, timestamp: Date.now() }));
  } catch (err) {
    console.error(JSON.stringify({ step: "execute_rebalance", error: (err as Error).message, timestamp: Date.now() }));
    throw err;
  }

  lastRebalanceTimestamp = Math.floor(Date.now() / 1000);

  // Step 10: Log WorkflowResult
  const result: WorkflowResult = {
    allocations: allocationResult,
    txHashes: rebalanceResult.txHashes,
    llmRationale: allocationResult.llmRationale,
    timestamp: startTime,
  };
  console.log(JSON.stringify({ step: "workflow_complete", result, timestamp: Date.now() }));
  return result;
}
