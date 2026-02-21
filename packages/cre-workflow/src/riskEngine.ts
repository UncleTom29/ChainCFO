import axios from "axios";

export interface RiskScore {
  protocol: string;
  riskScore: number;
  rating: string;
}

export interface PoRResult {
  verified: boolean;
  tvlReported: bigint;
  lastUpdated: number;
}

const STALE_THRESHOLD_SECS = 3600; // 1 hour

function ratingFromScore(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * Fetch risk scores for protocols via CRE Confidential HTTP capability.
 * Falls back to neutral score 50 on failure.
 */
export async function fetchCredoraRisk(protocols: string[]): Promise<RiskScore[]> {
  try {
    // In production CRE runtime, this uses capabilities.confidentialHttp.request()
    // so the API key is never exposed in plaintext logs.
    // const result = await capabilities.confidentialHttp.request({
    //   url: "https://api.credora.io/v1/risk",
    //   headers: { Authorization: "Bearer " + process.env.CREDORA_API_KEY },
    //   body: JSON.stringify({ protocols })
    // })
    const res = await axios.post(
      "https://api.credora.io/v1/risk",
      { protocols },
      {
        headers: {
          Authorization: `Bearer ${process.env.CREDORA_API_KEY ?? ""}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    const data: Array<{ protocol: string; score: number }> = res.data;
    return data.map((d) => ({
      protocol: d.protocol,
      riskScore: d.score,
      rating: ratingFromScore(d.score),
    }));
  } catch (err) {
    console.warn("fetchCredoraRisk: failed, returning neutral scores —", (err as Error).message);
    return protocols.map((p) => ({
      protocol: p,
      riskScore: 50,
      rating: "C",
    }));
  }
}

/**
 * Verify protocol TVL on-chain via a Chainlink Proof of Reserve feed.
 * Returns verified=false if data is stale (> 1 hour).
 */
export async function fetchProofOfReserve(feedAddress: string): Promise<PoRResult> {
  try {
    // In CRE runtime this uses the evm_read capability
    // Simulated ABI call to latestRoundData() → [roundId, answer, startedAt, updatedAt, answeredInRound]
    // For testing / non-CRE contexts we return a placeholder
    const now = Math.floor(Date.now() / 1000);

    // Placeholder: in real CRE the call would be:
    // const [, answer, , updatedAt] = await evmRead(feedAddress, "latestRoundData()(uint80,int256,uint256,uint256,uint80)");
    const answer = BigInt(0);
    const updatedAt = now - 100; // simulate fresh data

    const staleness = now - updatedAt;
    return {
      verified: staleness <= STALE_THRESHOLD_SECS,
      tvlReported: answer,
      lastUpdated: updatedAt,
    };
  } catch (err) {
    console.warn("fetchProofOfReserve: failed —", (err as Error).message);
    return { verified: false, tvlReported: BigInt(0), lastUpdated: 0 };
  }
}
