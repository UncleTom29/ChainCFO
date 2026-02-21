import { Registry, Gauge, Counter } from "prom-client";

export const registry = new Registry();

export const tvlGauge = new Gauge({
  name: "chaincfo_tvl_usd",
  help: "Total value locked in the treasury vault in USD",
  registers: [registry],
});

export const rebalanceCounter = new Counter({
  name: "chaincfo_rebalance_total",
  help: "Total number of rebalance operations",
  registers: [registry],
});

export const apiRequestCounter = new Counter({
  name: "chaincfo_api_requests_total",
  help: "Total number of API requests",
  labelNames: ["route", "status"],
  registers: [registry],
});
