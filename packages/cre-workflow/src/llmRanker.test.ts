import { describe, expect, test } from "bun:test";
import { validateCompliance } from "./llmRanker";

const policy = {
  maxAllocationBps: 5000,
  minLiquidityBufferBps: 500,
  maxProtocols: 5,
};

describe("validateCompliance", () => {
  test("returns compliant for valid allocations", () => {
    const allocations = [
      { protocol: "Aave v2", allocationBps: 5000, rationale: "" },
      { protocol: "Compound v2", allocationBps: 4500, rationale: "" },
    ];
    const result = validateCompliance(allocations, policy);
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("catches maxAllocation violation", () => {
    const allocations = [
      { protocol: "Aave v2", allocationBps: 6000, rationale: "" },
    ];
    const result = validateCompliance(allocations, policy);
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes("6000 bps exceeds max 5000"))).toBe(true);
  });

  test("catches liquidity buffer violation", () => {
    const allocations = [
      { protocol: "Aave v2", allocationBps: 5000, rationale: "" },
      { protocol: "Compound v2", allocationBps: 5000, rationale: "" },
    ];
    const result = validateCompliance(allocations, policy);
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes("liquidity buffer"))).toBe(true);
  });

  test("catches too many protocols", () => {
    const tooMany = Array(6).fill({ protocol: "Protocol", allocationBps: 100, rationale: "" });
    const result = validateCompliance(tooMany, { ...policy, maxProtocols: 5 });
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes("exceeds maximum"))).toBe(true);
  });
});
