const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchTreasuryStats() {
  const res = await fetch(`${API_BASE}/api/treasury/stats`);
  if (!res.ok) throw new Error("Failed to fetch treasury stats");
  return res.json();
}

export async function fetchTreasuryHistory(limit = 10) {
  const res = await fetch(`${API_BASE}/api/treasury/history?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch treasury history");
  return res.json();
}

export async function fetchUserPosition(address: string) {
  const res = await fetch(`${API_BASE}/api/treasury/user/${address}`);
  if (!res.ok) throw new Error("Failed to fetch user position");
  return res.json();
}

export async function fetchProtocolBreakdown() {
  const res = await fetch(`${API_BASE}/api/analytics/protocol-breakdown`);
  if (!res.ok) throw new Error("Failed to fetch protocol breakdown");
  return res.json();
}

export async function fetchApyHistory(days = 30) {
  const res = await fetch(`${API_BASE}/api/analytics/apy-history?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch APY history");
  return res.json();
}

export async function fetchLlmDecisions(limit = 5) {
  const res = await fetch(`${API_BASE}/api/analytics/llm-decisions?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch LLM decisions");
  return res.json();
}

export async function fetchComplianceEvents() {
  const res = await fetch(`${API_BASE}/api/analytics/compliance-events`);
  if (!res.ok) throw new Error("Failed to fetch compliance events");
  return res.json();
}
