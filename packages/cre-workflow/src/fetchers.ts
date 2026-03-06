import { HTTPClient, type Runtime } from "@chainlink/cre-sdk";
import { median, ConsensusAggregationByFields } from "@chainlink/cre-sdk";

export interface ProtocolData {
  name: string;
  apy: number;
  tvlUsd: number;
  chainId: number;
  contractAddress: string;
}

const USDC_MAINNET_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const FALLBACK_PROTOCOLS: ProtocolData[] = [
  {
    name: "Aave v2",
    apy: 4.2,
    tvlUsd: 450000000,
    chainId: 1,
    contractAddress: "0x7d2768dE32b0b80b7a3454c06BdAcE5A1f78bF6C",
  },
  {
    name: "Compound v2",
    apy: 3.9,
    tvlUsd: 320000000,
    chainId: 1,
    contractAddress: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
  },
  {
    name: "Morpho Blue",
    apy: 4.6,
    tvlUsd: 210000000,
    chainId: 1,
    contractAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  },
];

export async function fetchAaveAPY(runtime: Runtime<any>): Promise<ProtocolData> {
  const client = new HTTPClient();
  const fetchRaw = client.sendRequest(runtime, async (req) => {
    // @ts-ignore
    const res = await req.sendRequest({
      url: "https://aave-api-v2.aave.com/data/liquidity/v2?poolId=proto_mainnet",
      method: "GET",
      headers: {},
      body: new Uint8Array()
    }).result();

    const reserves = JSON.parse(new TextDecoder().decode(res.body));
    const usdc = reserves.find(
      (r: any) =>
        r.symbol?.toUpperCase() === "USDC" ||
        r.underlyingAsset?.toLowerCase() === USDC_MAINNET_ADDRESS
    );
    if (!usdc) throw new Error("fetchAaveAPY: USDC reserve not found");

    return {
      apy: parseFloat(usdc.supplyAPY ?? usdc.liquidityRate ?? "0") * 100,
      tvlUsd: parseFloat(usdc.totalLiquidityUSD ?? "0")
    };
  }, ConsensusAggregationByFields({
    apy: () => median<number>(),
    tvlUsd: () => median<number>()
  }));

  const result = (await fetchRaw().result()) as any;
  return {
    name: "Aave v2",
    apy: result.apy,
    tvlUsd: result.tvlUsd,
    chainId: 1,
    contractAddress: "usdc.aTokenAddress" // placeholder 
  };
}

export async function fetchCompoundAPY(runtime: Runtime<any>): Promise<ProtocolData> {
  const client = new HTTPClient();
  const fetchRaw = client.sendRequest(runtime, async (req) => {
    // @ts-ignore
    const res = await req.sendRequest({
      url: "https://api.compound.finance/api/v2/ctoken?addresses[]=0xc3d688B66703497DAA19211EEdff47f25384cdc3",
      method: "GET",
      headers: {},
      body: new Uint8Array()
    }).result();

    const cToken = JSON.parse(new TextDecoder().decode(res.body))?.cToken?.[0];
    if (!cToken) throw new Error("fetchCompoundAPY: cToken not found");

    const supplyRate = parseFloat(cToken.supply_rate?.value ?? "0");
    return {
      apy: supplyRate * 100,
      tvlUsd: parseFloat(cToken.total_supply?.value ?? "0")
    };
  }, ConsensusAggregationByFields({
    apy: () => median<number>(),
    tvlUsd: () => median<number>()
  }));

  const result = (await fetchRaw().result()) as any;
  return {
    name: "Compound v2",
    apy: result.apy,
    tvlUsd: result.tvlUsd,
    chainId: 1,
    contractAddress: "0xc3d688B66703497DAA19211EEdff47f25384cdc3"
  };
}

export async function fetchMorphoAPY(runtime: Runtime<any>): Promise<ProtocolData> {
  const client = new HTTPClient();
  const fetchRaw = client.sendRequest(runtime, async (req) => {
    const query = `
      query {
        markets(where: { inputToken_: { symbol: "USDC" } }, first: 1) {
          id
          rates(where: { side: LENDER }) { rate }
          totalValueLockedUSD
        }
      }
    `;
    // @ts-ignore
    const res = await req.sendRequest({
      url: "https://blue-api.morpho.org/graphql",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new TextEncoder().encode(JSON.stringify({ query }))
    }).result();

    const market = JSON.parse(new TextDecoder().decode(res.body))?.data?.markets?.[0];
    if (!market) throw new Error("fetchMorphoAPY: USDC market not found");

    return {
      apy: parseFloat(market.rates?.[0]?.rate ?? "0") * 100,
      tvlUsd: parseFloat(market.totalValueLockedUSD ?? "0")
    };
  }, ConsensusAggregationByFields({
    apy: () => median<number>(),
    tvlUsd: () => median<number>()
  }));

  const result = (await fetchRaw().result()) as any;
  return {
    name: "Morpho Blue",
    apy: result.apy,
    tvlUsd: result.tvlUsd,
    chainId: 1,
    contractAddress: "morphoData" // placeholder
  };
}

export async function fetchAllProtocols(runtime: Runtime<any>): Promise<ProtocolData[]> {
  const results = await Promise.allSettled([
    fetchAaveAPY(runtime),
    fetchCompoundAPY(runtime),
    fetchMorphoAPY(runtime),
  ]);

  const successful: ProtocolData[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      runtime.log(`fetchAllProtocols failed: ${(result.reason as Error).message}`);
    }
  }

  if (successful.length === 0) {
    runtime.log("fetchAllProtocols: all live fetches failed, using deterministic fallback protocol set");
    return FALLBACK_PROTOCOLS;
  }

  return successful;
}
