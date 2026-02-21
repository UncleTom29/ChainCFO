import axios from "axios";
import { fetchAaveAPY, fetchAllProtocols } from "./fetchers";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("fetchers", () => {
  afterEach(() => jest.clearAllMocks());

  describe("fetchAaveAPY", () => {
    it("parses USDC supply APY correctly", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [
          {
            symbol: "USDC",
            supplyAPY: "0.05",
            totalLiquidityUSD: "1000000000",
            aTokenAddress: "0xabc",
          },
        ],
      });

      const result = await fetchAaveAPY();
      expect(result.name).toBe("Aave v2");
      expect(result.apy).toBeCloseTo(5.0, 2);
      expect(result.tvlUsd).toBe(1e9);
    });

    it("retries on failure and succeeds on 3rd attempt", async () => {
      const error = new Error("Network error");
      mockedAxios.get
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: [
            {
              symbol: "USDC",
              supplyAPY: "0.03",
              totalLiquidityUSD: "500000000",
              aTokenAddress: "0xdef",
            },
          ],
        });

      const result = await fetchAaveAPY();
      expect(result.apy).toBeCloseTo(3.0, 2);
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });
  });

  describe("fetchAllProtocols", () => {
    it("handles partial failures gracefully", async () => {
      // Aave succeeds, Compound and Morpho fail
      mockedAxios.get
        .mockResolvedValueOnce({
          data: [
            { symbol: "USDC", supplyAPY: "0.04", totalLiquidityUSD: "800000000", aTokenAddress: "0xaave" },
          ],
        })
        .mockRejectedValueOnce(new Error("Compound error"));

      mockedAxios.post.mockRejectedValueOnce(new Error("Morpho error"));

      const result = await fetchAllProtocols();
      // Should return at least 1 successful result (Aave)
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].name).toBe("Aave v2");
    });
  });
});
