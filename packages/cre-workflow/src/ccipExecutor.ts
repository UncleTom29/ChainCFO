import { EVMClient, prepareReportRequest, type Runtime, encodeCallMsg, LAST_FINALIZED_BLOCK_NUMBER } from "@chainlink/cre-sdk";
import { AllocationDecision } from "./llmRanker";
import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, encodeAbiParameters, hexToBytes } from "viem";

export interface RebalanceResult {
  txHashes: string[];
  success: boolean;
}

const PARITY_TOLERANCE = 0.005; // 0.5% depeg tolerance

/**
 * Read Chainlink USDC/USD Data Feed to verify stablecoin peg via evm_read capability.
 */
export async function checkStablecoinPeg(runtime: Runtime<any>, feedAddress: string): Promise<boolean> {
  try {
    const client = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);
    const abi = parseAbi([
      "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
    ]);
    const reply = await client.callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: feedAddress as `0x${string}`,
        data: encodeFunctionData({ abi, functionName: "latestRoundData" })
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER
    }).result();

    const decoded = decodeFunctionResult({ abi, functionName: "latestRoundData", data: reply.data as any }) as any;
    // @ts-ignore
    const answer = decoded[1] as bigint;
    const price = Number(answer) / 1e8; // USDC/USD feed has 8 decimals

    return price >= 1 - PARITY_TOLERANCE && price <= 1 + PARITY_TOLERANCE;
  } catch (err) {
    runtime.log(`checkStablecoinPeg: failed — ${(err as Error).message}`);
    return false;
  }
}

/**
 * Execute rebalance via EVM writeReport (same chain).
 */
export async function executeRebalance(
  runtime: Runtime<any>,
  allocations: AllocationDecision[],
  vaultAddress: string,
  llmRationale: string,
  totalValueUsd: number
): Promise<string> {
  const client = new EVMClient(EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]);

  const allocationStructs = allocations.map(a => ({
    protocol: "0x0000000000000000000000000000000000000000",
    chainId: BigInt(11155111),
    basisPoints: BigInt(a.allocationBps),
    name: a.protocol
  }));

  runtime.log(`Executing allocation for ${allocations.length} protocols`);
  for (const allocation of allocations) {
    runtime.log(`Executing allocation: ${allocation.protocol} → ${allocation.allocationBps} bps`);
  }

  try {
    runtime.log(`[executeRebalance] encoding ABI parameters...`);
    // @ts-ignore
    const reportData = encodeAbiParameters(
      [
        {
          type: "tuple[]",
          name: "allocations",
          components: [
            { type: "address", name: "protocol" },
            { type: "uint256", name: "chainId" },
            { type: "uint256", name: "basisPoints" },
            { type: "string", name: "name" }
          ]
        },
        { type: "string", name: "llmRationale" },
        { type: "uint256", name: "totalValueUsd" }
      ],
      [allocationStructs, llmRationale, BigInt(Math.floor(totalValueUsd))] as Extract<never, never>
    );

    runtime.log(`[executeRebalance] creating report with runtime.report... type of runtime.report: ${typeof runtime.report}`);
    const signedReportResponse = runtime.report(prepareReportRequest(reportData)).result();

    runtime.log(`[executeRebalance] calling client.writeReport... type of client.writeReport: ${typeof client.writeReport}`);
    const txResponse = client.writeReport(runtime, {
      receiver: vaultAddress,
      report: signedReportResponse
    } as any).result();

    return (txResponse as any)?.txHash || "0x_mock_tx_if_no_hash_returned";
  } catch (err) {
    runtime.log(`execute_rebalance error: ${(err as Error).message}\n${(err as Error).stack}`);
    throw err;
  }
}
