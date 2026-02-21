import axios, { AxiosError } from "axios";

export interface ProtocolData {
  name: string;
  apy: number;
  tvlUsd: number;
  chainId: number;
  contractAddress: string;
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const USDC_MAINNET_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

async function withRetry<T>(fn: () => Promise<T>, attempts = RETRY_ATTEMPTS): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error("withRetry: exhausted attempts");
}

export async function fetchAaveAPY(): Promise<ProtocolData> {
  return withRetry(async () => {
    const res = await axios.get(
      "https://aave-api-v2.aave.com/data/liquidity/v2?poolId=proto_mainnet",
      { timeout: 10000 }
    );
    const reserves: any[] = res.data;
    const usdc = reserves.find(
      (r: any) =>
        r.symbol?.toUpperCase() === "USDC" ||
        r.underlyingAsset?.toLowerCase() === USDC_MAINNET_ADDRESS
    );
    if (!usdc) throw new Error("fetchAaveAPY: USDC reserve not found");
    const apy = parseFloat(usdc.supplyAPY ?? usdc.liquidityRate ?? "0") * 100;
    return {
      name: "Aave v2",
      apy,
      tvlUsd: parseFloat(usdc.totalLiquidityUSD ?? "0"),
      chainId: 1,
      contractAddress: usdc.aTokenAddress ?? "",
    };
  });
}

export async function fetchCompoundAPY(): Promise<ProtocolData> {
  return withRetry(async () => {
    const res = await axios.get(
      "https://api.compound.finance/api/v2/ctoken?addresses[]=0xc3d688B66703497DAA19211EEdff47f25384cdc3",
      { timeout: 10000 }
    );
    const cToken = res.data?.cToken?.[0];
    if (!cToken) throw new Error("fetchCompoundAPY: cToken not found");
    const supplyRate = parseFloat(cToken.supply_rate?.value ?? "0");
    const apy = supplyRate * 100;
    return {
      name: "Compound v2",
      apy,
      tvlUsd: parseFloat(cToken.total_supply?.value ?? "0"),
      chainId: 1,
      contractAddress: cToken.token_address ?? "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
    };
  });
}

export async function fetchMorphoAPY(): Promise<ProtocolData> {
  return withRetry(async () => {
    const query = `
      query {
        markets(where: { inputToken_: { symbol: "USDC" } }, first: 1) {
          id
          inputToken { symbol decimals }
          rates(where: { side: LENDER }) { rate }
          totalValueLockedUSD
          outputToken { id }
        }
      }
    `;
    const res = await axios.post(
      "https://blue-api.morpho.org/graphql",
      { query },
      { timeout: 10000, headers: { "Content-Type": "application/json" } }
    );
    const market = res.data?.data?.markets?.[0];
    if (!market) throw new Error("fetchMorphoAPY: USDC market not found");
    const supplyApy = parseFloat(market.rates?.[0]?.rate ?? "0") * 100;
    return {
      name: "Morpho Blue",
      apy: supplyApy,
      tvlUsd: parseFloat(market.totalValueLockedUSD ?? "0"),
      chainId: 1,
      contractAddress: market.id ?? "",
    };
  });
}

export async function fetchAllProtocols(): Promise<ProtocolData[]> {
  const results = await Promise.allSettled([
    fetchAaveAPY(),
    fetchCompoundAPY(),
    fetchMorphoAPY(),
  ]);

  const successful: ProtocolData[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      console.warn("fetchAllProtocols: protocol fetch failed —", (result.reason as Error).message);
    }
  }
  return successful;
}
