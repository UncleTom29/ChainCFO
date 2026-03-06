import { ConfidentialHTTPClient, type Runtime } from "@chainlink/cre-sdk";
import { ProtocolData } from "./fetchers";
import { RiskScore } from "./riskEngine";

export interface AllocationDecision {
  protocol: string;
  allocationBps: number;
  rationale: string;
}

export interface PolicyParams {
  maxAllocationBps: number;
  minLiquidityBufferBps: number;
  maxProtocols: number;
}

export interface AllocationResult {
  allocations: AllocationDecision[];
  llmRationale: string;
  timestamp: number;
}

export interface ComplianceResult {
  compliant: boolean;
  violations: string[];
}

function equalDistribution(
  protocols: ProtocolData[],
  policy: PolicyParams
): AllocationDecision[] {
  if (protocols.length === 0) return [];
  const available = 10000 - policy.minLiquidityBufferBps;
  const perProtocol = Math.floor(available / protocols.length);
  return protocols.map((p) => ({
    protocol: p.name,
    allocationBps: Math.min(perProtocol, policy.maxAllocationBps),
    rationale: "Equal distribution fallback",
  }));
}

/**
 * Use Gemini 1.5 Pro to rank protocol allocations within policy constraints via CRE.
 */
export async function rankAllocations(
  runtime: Runtime<any>,
  protocols: ProtocolData[],
  riskScores: RiskScore[],
  policy: PolicyParams
): Promise<AllocationResult> {
  const riskMap = new Map(riskScores.map((r) => [r.protocol, r]));
  const available = 10000 - policy.minLiquidityBufferBps;

  const protocolTable = protocols.map((p) => {
    const risk = riskMap.get(p.name);
    const apy = typeof p.apy === "number" ? p.apy : 0;
    const tvlUsd = typeof p.tvlUsd === "number" ? p.tvlUsd : 0;
    return `| ${p.name} | ${apy.toFixed(2)}% | $${(tvlUsd / 1e6).toFixed(2)}M | ${risk?.riskScore ?? 50} |`;
  }).join("\n");

  const prompt = `You are a DeFi treasury manager. Allocate stablecoin across the following protocols within the given constraints.

Protocol Table:
| Protocol | APY | TVL | Risk Score (0-100, lower is riskier) |
|----------|-----|-----|--------------------------------------|
${protocolTable}

Constraints:
- Total allocatable basis points: ${available} (out of 10000; ${policy.minLiquidityBufferBps} bps reserved as liquidity buffer)
- Maximum allocation per protocol: ${policy.maxAllocationBps} bps
- Maximum protocols: ${policy.maxProtocols}
- Sum of allocationBps must equal exactly ${available}

Respond with valid JSON only, no markdown, no explanation outside the JSON:
{
  "allocations": [
    { "protocol": "<name>", "allocationBps": <number>, "rationale": "<one sentence>" }
  ],
  "llmRationale": "<overall rationale paragraph>"
}`;

  try {
    const client = new ConfidentialHTTPClient();
    // @ts-ignore
    const apiKey = (await runtime.getSecret("OPENROUTER_API_KEY")) as string;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY secret is not configured");
    }

    const res = await client.sendRequest(runtime, {
      request: {
        url: "https://openrouter.ai/api/v1/chat/completions",
        method: "POST",
        multiHeaders: {
          "Authorization": { values: [`Bearer ${apiKey}`] },
          "Content-Type": { values: ["application/json"] }
        },
        bodyString: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        })
      }
    }).result();

    const jsonText = new TextDecoder().decode(res.body);
    const data = JSON.parse(jsonText);

    const text: string = data?.choices?.[0]?.message?.content ?? "";
    if (!text) {
      runtime.log(`rankAllocations: unexpected LLM response structure: ${jsonText}`);
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.allocations)) throw new Error("Invalid allocations array");

    return {
      allocations: parsed.allocations as AllocationDecision[],
      llmRationale: parsed.llmRationale ?? "AI-generated allocation",
      timestamp: runtime.now().getTime(),
    };
  } catch (err) {
    console.error("DEBUG:", err);
    runtime.log(`rankAllocations: LLM failed, falling back to equal distribution — ${(err as Error).message}`);
    return {
      allocations: equalDistribution(protocols, policy),
      llmRationale: "Equal distribution fallback due to LLM error",
      timestamp: runtime.now().getTime(),
    };
  }
}

/**
 * Validate that allocations comply with policy constraints.
 */
export function validateCompliance(
  allocations: AllocationDecision[],
  policy: PolicyParams
): ComplianceResult {
  const violations: string[] = [];

  const totalBps = allocations.reduce((sum, a) => sum + a.allocationBps, 0);
  const availableBps = 10000 - policy.minLiquidityBufferBps;

  for (const a of allocations) {
    if (a.allocationBps > policy.maxAllocationBps) {
      violations.push(
        `${a.protocol} allocation ${a.allocationBps} bps exceeds max ${policy.maxAllocationBps} bps`
      );
    }
  }

  if (totalBps > availableBps) {
    violations.push(
      `Total allocation ${totalBps} bps exceeds available ${availableBps} bps (liquidity buffer: ${policy.minLiquidityBufferBps} bps)`
    );
  }

  if (allocations.length > policy.maxProtocols) {
    violations.push(
      `${allocations.length} protocols exceeds maximum ${policy.maxProtocols}`
    );
  }

  return { compliant: violations.length === 0, violations };
}
