import axios from "axios";
import { rankAllocations, validateCompliance } from "./llmRanker";
import { ProtocolData } from "./fetchers";
import { RiskScore } from "./riskEngine";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const protocols: ProtocolData[] = [
  { name: "Aave v2", apy: 5.0, tvlUsd: 1e9, chainId: 1, contractAddress: "0xaave" },
  { name: "Compound v2", apy: 4.0, tvlUsd: 5e8, chainId: 1, contractAddress: "0xcomp" },
];

const riskScores: RiskScore[] = [
  { protocol: "Aave v2", riskScore: 80, rating: "A" },
  { protocol: "Compound v2", riskScore: 70, rating: "B" },
];

const policy = {
  maxAllocationBps: 5000,
  minLiquidityBufferBps: 500,
  maxProtocols: 5,
};

describe("llmRanker", () => {
  afterEach(() => jest.clearAllMocks());

  describe("rankAllocations", () => {
    it("parses valid Gemini JSON response", async () => {
      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      allocations: [
                        { protocol: "Aave v2", allocationBps: 5000, rationale: "High APY" },
                        { protocol: "Compound v2", allocationBps: 4500, rationale: "Stable" },
                      ],
                      llmRationale: "Balanced allocation favoring Aave for yield",
                    }),
                  },
                ],
              },
            },
          ],
        },
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await rankAllocations(protocols, riskScores, policy);
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0].protocol).toBe("Aave v2");
      expect(result.allocations[0].allocationBps).toBe(5000);
    });

    it("falls back to equal distribution on malformed JSON", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          candidates: [{ content: { parts: [{ text: "not valid json {{" }] } }],
        },
      });

      const result = await rankAllocations(protocols, riskScores, policy);
      expect(result.allocations).toHaveLength(2);
      expect(result.llmRationale).toContain("fallback");
    });

    it("falls back when LLM request fails", async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error("API error"));
      const result = await rankAllocations(protocols, riskScores, policy);
      expect(result.allocations.length).toBeGreaterThan(0);
      expect(result.llmRationale).toContain("fallback");
    });
  });

  describe("validateCompliance", () => {
    it("returns compliant for valid allocations", () => {
      const allocations = [
        { protocol: "Aave v2", allocationBps: 5000, rationale: "" },
        { protocol: "Compound v2", allocationBps: 4500, rationale: "" },
      ];
      const result = validateCompliance(allocations, policy);
      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("catches maxAllocation violation", () => {
      const allocations = [
        { protocol: "Aave v2", allocationBps: 6000, rationale: "" }, // exceeds 5000
      ];
      const result = validateCompliance(allocations, policy);
      expect(result.compliant).toBe(false);
      expect(result.violations[0]).toContain("6000 bps exceeds max 5000");
    });

    it("catches liquidity buffer violation", () => {
      const allocations = [
        { protocol: "Aave v2", allocationBps: 5000, rationale: "" },
        { protocol: "Compound v2", allocationBps: 5000, rationale: "" }, // total = 10000, exceeds 9500
      ];
      const result = validateCompliance(allocations, policy);
      expect(result.compliant).toBe(false);
      expect(result.violations.some((v) => v.includes("liquidity buffer"))).toBe(true);
    });

    it("catches too many protocols", () => {
      const tooMany = Array(6).fill({ protocol: "Protocol", allocationBps: 100, rationale: "" });
      const result = validateCompliance(tooMany, { ...policy, maxProtocols: 5 });
      expect(result.compliant).toBe(false);
      expect(result.violations.some((v) => v.includes("exceeds maximum"))).toBe(true);
    });
  });
});
