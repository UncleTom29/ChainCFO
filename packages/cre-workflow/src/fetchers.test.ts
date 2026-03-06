import { describe, expect } from "bun:test";
import { newTestRuntime, test } from "@chainlink/cre-sdk/test";
import { fetchAllProtocols, type ProtocolData } from "./fetchers";

describe("fetchAllProtocols", () => {
  test("returns protocol data when called with test runtime", async () => {
    const runtime = newTestRuntime();

    const result: ProtocolData[] = await fetchAllProtocols(runtime);

    // Should return at least one protocol (live or fallback)
    expect(result.length).toBeGreaterThan(0);
    // Each entry should have the required shape
    for (const protocol of result) {
      expect(typeof protocol.name).toBe("string");
      expect(typeof protocol.apy).toBe("number");
      expect(typeof protocol.tvlUsd).toBe("number");
      expect(typeof protocol.chainId).toBe("number");
      expect(typeof protocol.contractAddress).toBe("string");
    }
  });
});
