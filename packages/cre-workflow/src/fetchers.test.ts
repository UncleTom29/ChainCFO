import { describe, expect, test } from "bun:test";
import { fetchAaveAPY, fetchCompoundAPY, fetchMorphoAPY, fetchAllProtocols } from "./fetchers";

describe("fetchers", () => {
  test("exports the expected async functions", () => {
    expect(typeof fetchAaveAPY).toBe("function");
    expect(typeof fetchCompoundAPY).toBe("function");
    expect(typeof fetchMorphoAPY).toBe("function");
    expect(typeof fetchAllProtocols).toBe("function");
  });
});
