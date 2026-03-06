import { CronCapability, EVMClient, handler, Runner, type Runtime, encodeCallMsg, LATEST_BLOCK_NUMBER } from "@chainlink/cre-sdk";
import { fetchAllProtocols } from "./fetchers";
import { fetchCredoraRisk, fetchProofOfReserve } from "./riskEngine";
import { rankAllocations, validateCompliance, type AllocationResult } from "./llmRanker";
import { checkStablecoinPeg, executeRebalance } from "./ccipExecutor";
import { bytesToHex, decodeFunctionResult, encodeFunctionData, hexToBytes, parseAbi, zeroAddress } from "viem";

export type Config = {
  schedule: string;
  governanceContract: string;
  feedAddress: string;
  treasuryVaultAddress: string;
};

interface GovernancePolicy {
  maxAllocationBps: number;
  minLiquidityBufferBps: number;
  maxProtocols: number;
  rebalanceIntervalSecs: number;
  requireProofOfReserve: boolean;
}

async function getGovernancePolicy(runtime: Runtime<Config>): Promise<GovernancePolicy> {
  const client = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
  const abi = parseAbi([
    "function getPolicy() view returns (uint256 maxAllocationBps, uint256 minLiquidityBufferBps, uint256 maxProtocols, uint256 rebalanceIntervalSecs, bool requireProofOfReserve)"
  ]);

  runtime.log(`[getGovernancePolicy] Calling contract: ${runtime.config.governanceContract}`);

  const callData = encodeFunctionData({ abi, functionName: "getPolicy" });
  runtime.log(`[getGovernancePolicy] Calldata: ${callData}`);

  const resRaw = await client.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: runtime.config.governanceContract as `0x${string}`,
      data: callData
    }),
    blockNumber: LATEST_BLOCK_NUMBER,
  }).result();

  runtime.log(`[getGovernancePolicy] Raw response: ${JSON.stringify(resRaw)}`);

  const decoded = decodeFunctionResult({ abi, functionName: "getPolicy", data: resRaw.data as any }) as [bigint, bigint, bigint, bigint, boolean];

  return {
    maxAllocationBps: Number(decoded[0]),
    minLiquidityBufferBps: Number(decoded[1]),
    maxProtocols: Number(decoded[2]),
    rebalanceIntervalSecs: Number(decoded[3]),
    requireProofOfReserve: Boolean(decoded[4]),
  };
}

export const runRebalanceWorkflow = async (runtime: Runtime<Config>, triggerType: string) => {
  const startTime = runtime.now().getTime();
  runtime.log(`[${triggerType}] Workflow start at ${startTime}`);

  // Step 1: Read governance policy
  let policy: GovernancePolicy;
  try {
    policy = await getGovernancePolicy(runtime);
    runtime.log(`Policy retrieved: ${JSON.stringify(policy)}`);
  } catch (err) {
    runtime.log(`policy_read error: ${(err as Error).message}. Using default fallback policy for this run.`);
    policy = {
      maxAllocationBps: 5000,
      minLiquidityBufferBps: 500,
      maxProtocols: 5,
      rebalanceIntervalSecs: 14400,
      requireProofOfReserve: false,
    };
  }

  // Step 3: Check stablecoin peg
  try {
    const feedAddress = runtime.config.feedAddress || "0x95e10BaC2B89aB4D8508ccEC3f08494FcB3D23cb"; // Sepolia USDC/USD placeholder
    const pegOk = await checkStablecoinPeg(runtime, feedAddress);
    if (!pegOk) {
      runtime.log("WARNING: USDC has depegged. Aborting.");
      return "Aborting: USDC has depegged";
    }
    runtime.log("Peg check passed.");
  } catch (err) {
    runtime.log(`peg_check error: ${(err as Error).message}`);
    throw err;
  }

  // Step 4: Fetch protocol APY data
  let protocols;
  try {
    protocols = await fetchAllProtocols(runtime);
    runtime.log(`Protocols fetched: ${protocols.length}`);
    if (protocols.length === 0) {
      throw new Error("No protocols available");
    }
  } catch (err) {
    runtime.log(`fetch_protocols error: ${(err as Error).message}`);
    throw err;
  }

  // Step 5: Fetch Credora risk scores
  let riskScores;
  try {
    riskScores = await fetchCredoraRisk(runtime, protocols.map((p) => p.name));
    runtime.log(`Risk scores fetched: ${riskScores.length}`);
  } catch (err) {
    runtime.log(`fetch_risk error: ${(err as Error).message}`);
    throw err;
  }

  // Step 6: Proof of Reserve check (if required by policy)
  if (policy.requireProofOfReserve) {
    const verifiedProtocols = [];
    for (const p of protocols) {
      try {
        const porResult = await fetchProofOfReserve(runtime, p.contractAddress);
        if (porResult.verified) {
          verifiedProtocols.push(p);
        } else {
          runtime.log(`por_check: Protocol ${p.name} excluded`);
        }
      } catch (err) {
        runtime.log(`por_check: Protocol ${p.name} error: ${(err as Error).message}`);
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
    allocationResult = await rankAllocations(runtime, protocols, riskScores, {
      maxAllocationBps: policy.maxAllocationBps,
      minLiquidityBufferBps: policy.minLiquidityBufferBps,
      maxProtocols: policy.maxProtocols,
    });
    runtime.log(`Allocations ranked: ${allocationResult.allocations.length}`);
  } catch (err) {
    runtime.log(`rank_allocations error: ${(err as Error).message}`);
    throw err;
  }

  // Step 8: Validate compliance
  const complianceResult = validateCompliance(allocationResult.allocations, {
    maxAllocationBps: policy.maxAllocationBps,
    minLiquidityBufferBps: policy.minLiquidityBufferBps,
    maxProtocols: policy.maxProtocols,
  });

  if (!complianceResult.compliant) {
    const reason = `Compliance violations: ${complianceResult.violations.join("; ")}`;
    runtime.log(`Compliance failed: ${reason}`);
    return reason;
  }
  runtime.log("Compliance check passed.");

  // Step 9: Execute rebalance via CCIP/EVMClient (Vault)
  const vaultAddress = runtime.config.treasuryVaultAddress;
  let txHash;
  try {
    txHash = await executeRebalance(
      runtime,
      allocationResult.allocations,
      vaultAddress,
      allocationResult.llmRationale,
      allocationResult.allocations.reduce((sum, a) => sum + a.allocationBps, 0)
    );
    runtime.log(`Rebalance executed: tx hash = ${txHash}`);
  } catch (err) {
    runtime.log(`execute_rebalance error: ${(err as Error).message}`);
    throw err;
  }

  runtime.log(`Workflow complete for ${triggerType}. Rationale: ${allocationResult.llmRationale}`);
  return "Success";
};

export const onCronTrigger = async (runtime: Runtime<Config>): Promise<string> => {
  return await runRebalanceWorkflow(runtime, "cron");
};

export const onEvmLogTrigger = async (runtime: Runtime<Config>, log: any): Promise<string> => {
  runtime.log(`EVM Event triggered from Block Hash: ${log.blockHash}`);
  return await runRebalanceWorkflow(runtime, "evm_log");
};

export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  const evm = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);

  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
    handler(
      evm.logTrigger({
        addresses: [config.governanceContract],
        topics: [{ values: ["0x0000000000000000000000000000000000000000000000000000000000000000"] }],
      }),
      onEvmLogTrigger
    )
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
