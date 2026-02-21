"use client";

import { useQuery } from "@tanstack/react-query";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import {
  fetchTreasuryStats,
  fetchProtocolBreakdown,
  fetchApyHistory,
  fetchTreasuryHistory,
} from "@/lib/api";
import { DepositWithdrawPanel } from "./components/DepositWithdrawPanel";
import { AIDecisionLog } from "./components/AIDecisionLog";

const PIE_COLORS = ["#00BCD4", "#0D47A1", "#4CAF50", "#FF9800", "#F44336"];

function KPICard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      {loading ? (
        <div className="h-8 bg-gray-700 animate-pulse rounded w-24" />
      ) : (
        <p className="text-2xl font-bold text-white">{value}</p>
      )}
    </Card>
  );
}

function formatCountdown(ms: number | null): string {
  if (!ms) return "—";
  const remaining = ms - Date.now();
  if (remaining <= 0) return "Soon";
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ["treasury-stats"],
    queryFn: fetchTreasuryStats,
    refetchInterval: 30000,
  });

  const breakdownQuery = useQuery({
    queryKey: ["protocol-breakdown"],
    queryFn: fetchProtocolBreakdown,
    refetchInterval: 60000,
  });

  const apyQuery = useQuery({
    queryKey: ["apy-history"],
    queryFn: () => fetchApyHistory(30),
    refetchInterval: 60000,
  });

  const historyQuery = useQuery({
    queryKey: ["treasury-history"],
    queryFn: () => fetchTreasuryHistory(5),
    refetchInterval: 60000,
  });

  const stats = statsQuery.data?.data;
  const breakdown = breakdownQuery.data?.data ?? [];
  const apyHistory = apyQuery.data?.data ?? [];
  const history = historyQuery.data?.data ?? [];

  const weightedApy =
    breakdown.length > 0
      ? breakdown.reduce(
          (sum: number, p: any) =>
            sum + (parseFloat(p.apy) * parseFloat(p.percentage)) / 100,
          0
        )
      : 0;

  return (
    <div className="min-h-screen bg-surface text-white flex">
      {/* Sidebar */}
      <aside className="w-56 bg-card border-r border-gray-700 flex-shrink-0 hidden md:flex flex-col py-6 px-4">
        <Link href="/" className="text-xl font-bold text-accent mb-8 block">
          ChainCFO
        </Link>
        <nav className="space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium"
          >
            📊 Dashboard
          </Link>
          <Link
            href="/governance"
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-300 text-sm"
          >
            🏛️ Governance
          </Link>
        </nav>
        <div className="mt-auto">
          <Badge variant="accent" className="text-xs">⬡ Chainlink</Badge>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-gray-700 bg-card px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">Dashboard</h1>
          <ConnectButton />
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard
              label="Total TVL"
              value={stats ? `$${parseFloat(stats.tvlUsd).toLocaleString()}` : "—"}
              loading={statsQuery.isLoading}
            />
            <KPICard
              label="Weighted APY"
              value={`${weightedApy.toFixed(2)}%`}
              loading={breakdownQuery.isLoading}
            />
            <KPICard
              label="Active Protocols"
              value={breakdown.length.toString()}
              loading={breakdownQuery.isLoading}
            />
            <KPICard
              label="Last Rebalance"
              value={
                stats?.lastRebalanced
                  ? new Date(stats.lastRebalanced).toLocaleTimeString()
                  : "—"
              }
              loading={statsQuery.isLoading}
            />
            <KPICard
              label="Next Rebalance"
              value={formatCountdown(stats?.nextRebalance)}
              loading={statsQuery.isLoading}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Allocation Pie Chart */}
            <Card>
              <h2 className="text-lg font-semibold mb-4 text-white">
                Protocol Allocation
              </h2>
              {breakdownQuery.isLoading ? (
                <div className="flex justify-center items-center h-48">
                  <Spinner />
                </div>
              ) : breakdown.length === 0 ? (
                <p className="text-gray-400 text-center py-12">No allocations yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="percentage"
                      nameKey="protocol"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {breakdown.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => [
                        `${value}% · APY ${props.payload.apy}%`,
                        props.payload.protocol,
                      ]}
                      contentStyle={{ background: "#16213E", border: "1px solid #374151" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* APY History */}
            <Card>
              <h2 className="text-lg font-semibold mb-4 text-white">
                APY History (30d)
              </h2>
              {apyQuery.isLoading ? (
                <div className="flex justify-center items-center h-48">
                  <Spinner />
                </div>
              ) : apyHistory.length === 0 ? (
                <p className="text-gray-400 text-center py-12">No history yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={apyHistory}>
                    <defs>
                      <linearGradient id="apyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00BCD4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00BCD4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => new Date(d).toLocaleDateString()}
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#16213E", border: "1px solid #374151" }}
                      formatter={(v: any) => [`${v}%`, "Weighted APY"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="weightedApy"
                      stroke="#00BCD4"
                      fill="url(#apyGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Recent Rebalances */}
          <Card>
            <h2 className="text-lg font-semibold mb-4 text-white">
              Recent Rebalances
            </h2>
            {historyQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : history.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No rebalances yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left pb-3">Date</th>
                      <th className="text-left pb-3">Total Value</th>
                      <th className="text-left pb-3">Protocols</th>
                      <th className="text-left pb-3">AI Summary</th>
                      <th className="text-left pb-3">Tx</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {history.map((r: any) => (
                      <tr key={r.id} className="py-2">
                        <td className="py-3 text-gray-300">
                          {new Date(r.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 text-white">
                          ${r.totalValueUsd?.toLocaleString()}
                        </td>
                        <td className="py-3">
                          <Badge variant="accent">{r.allocations?.length ?? 0} protocols</Badge>
                        </td>
                        <td className="py-3 text-gray-400 max-w-xs truncate">
                          {r.llmRationale}
                        </td>
                        <td className="py-3">
                          {r.txHash ? (
                            <a
                              href={`https://sepolia.etherscan.io/tx/${r.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline"
                            >
                              {r.txHash.slice(0, 8)}…
                            </a>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Deposit/Withdraw + AI Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DepositWithdrawPanel />
            <AIDecisionLog />
          </div>
        </main>
      </div>
    </div>
  );
}
