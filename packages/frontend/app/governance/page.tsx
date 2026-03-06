"use client";

import { useState } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import {
  GOVERNANCE_POLICY_ADDRESS,
  GOVERNANCE_POLICY_ABI,
} from "@/lib/contracts";
import { fetchComplianceEvents } from "@/lib/api";

interface PolicyForm {
  maxAllocationBps: number;
  minLiquidityBufferBps: number;
  maxProtocols: number;
  rebalanceIntervalSecs: number;
  requireProofOfReserve: boolean;
}

const DEFAULT_FORM: PolicyForm = {
  maxAllocationBps: 5000,
  minLiquidityBufferBps: 500,
  maxProtocols: 5,
  rebalanceIntervalSecs: 14400,
  requireProofOfReserve: false,
};

export default function GovernancePage() {
  const [form, setForm] = useState<PolicyForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Read current policy
  const { data: currentPolicy, isLoading: policyLoading } = useReadContract({
    address: GOVERNANCE_POLICY_ADDRESS,
    abi: GOVERNANCE_POLICY_ABI,
    functionName: "getPolicy",
  });

  // Write: propose policy
  const { writeContract: proposeWrite, data: proposeTxHash } = useWriteContract();
  const { isLoading: proposePending } = useWaitForTransactionReceipt({
    hash: proposeTxHash,
  });

  // Write: vote / execute
  const { writeContract: voteWrite, data: voteTxHash } = useWriteContract();
  const { writeContract: executeWrite, data: executeTxHash } = useWriteContract();

  // Compliance events
  const complianceQuery = useQuery({
    queryKey: ["compliance-events"],
    queryFn: fetchComplianceEvents,
    refetchInterval: 30000,
  });
  const complianceEvents = complianceQuery.data?.data ?? [];

  function validateForm(): boolean {
    if (form.maxAllocationBps < 1 || form.maxAllocationBps > 10000) {
      setFormError("maxAllocationBps must be between 1 and 10000");
      return false;
    }
    if (form.minLiquidityBufferBps < 0 || form.minLiquidityBufferBps >= 10000) {
      setFormError("minLiquidityBufferBps must be between 0 and 9999");
      return false;
    }
    if (form.maxProtocols < 1) {
      setFormError("maxProtocols must be at least 1");
      return false;
    }
    if (form.rebalanceIntervalSecs < 60) {
      setFormError("rebalanceIntervalSecs must be at least 60");
      return false;
    }
    setFormError(null);
    return true;
  }

  function handlePropose() {
    if (!validateForm() || !GOVERNANCE_POLICY_ADDRESS) return;
    proposeWrite(
      {
        address: GOVERNANCE_POLICY_ADDRESS,
        abi: GOVERNANCE_POLICY_ABI,
        functionName: "proposePolicy",
        args: [
          {
            maxAllocationBps: BigInt(form.maxAllocationBps),
            minLiquidityBufferBps: BigInt(form.minLiquidityBufferBps),
            maxProtocols: BigInt(form.maxProtocols),
            rebalanceIntervalSecs: BigInt(form.rebalanceIntervalSecs),
            requireProofOfReserve: form.requireProofOfReserve,
          },
        ],
      },
      {
        onSuccess: () => toast.success("Policy proposal submitted!"),
        onError: (e) => toast.error(`Proposal failed: ${e.message}`),
      }
    );
  }

  function handleVote(proposalId: number) {
    if (!GOVERNANCE_POLICY_ADDRESS) return;
    voteWrite(
      {
        address: GOVERNANCE_POLICY_ADDRESS,
        abi: GOVERNANCE_POLICY_ABI,
        functionName: "votePolicy",
        args: [BigInt(proposalId)],
      },
      {
        onSuccess: () => toast.success("Vote cast!"),
        onError: (e) => toast.error(`Vote failed: ${e.message}`),
      }
    );
  }

  function handleExecute(proposalId: number) {
    if (!GOVERNANCE_POLICY_ADDRESS) return;
    executeWrite(
      {
        address: GOVERNANCE_POLICY_ADDRESS,
        abi: GOVERNANCE_POLICY_ABI,
        functionName: "executePolicy",
        args: [BigInt(proposalId)],
      },
      {
        onSuccess: () =>
          toast.success("Policy executed! CRE rebalance will be triggered."),
        onError: (e) => toast.error(`Execute failed: ${e.message}`),
      }
    );
  }

  const policy = currentPolicy as any;

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
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-300 text-sm"
          >
            📊 Dashboard
          </Link>
          <Link
            href="/governance"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium"
          >
            🏛️ Governance
          </Link>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-gray-700 bg-card px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">Governance</h1>
          <ConnectButton />
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Current Policy */}
          <Card>
            <h2 className="text-lg font-semibold mb-4 text-white">Current Policy</h2>
            {policyLoading ? (
              <Spinner />
            ) : !policy ? (
              <p className="text-gray-400">No policy loaded — connect wallet and set contract address</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Max Allocation</p>
                  <p className="text-white font-semibold">
                    {Number(policy.maxAllocationBps) / 100}%
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Liquidity Buffer</p>
                  <p className="text-white font-semibold">
                    {Number(policy.minLiquidityBufferBps) / 100}%
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Max Protocols</p>
                  <p className="text-white font-semibold">{Number(policy.maxProtocols)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Rebalance Interval</p>
                  <p className="text-white font-semibold">
                    {Number(policy.rebalanceIntervalSecs) / 3600}h
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Proof of Reserve</p>
                  <Badge variant={policy.requireProofOfReserve ? "success" : "default"}>
                    {policy.requireProofOfReserve ? "Required" : "Not required"}
                  </Badge>
                </div>
              </div>
            )}
          </Card>

          {/* Propose Policy */}
          <Card>
            <h2 className="text-lg font-semibold mb-4 text-white">Propose New Policy</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Max Allocation (bps)
                </label>
                <input
                  type="range"
                  min={100}
                  max={10000}
                  step={100}
                  value={form.maxAllocationBps}
                  onChange={(e) =>
                    setForm({ ...form, maxAllocationBps: parseInt(e.target.value) })
                  }
                  className="w-full accent-accent"
                />
                <p className="text-xs text-accent mt-1">
                  {form.maxAllocationBps} bps ({form.maxAllocationBps / 100}%)
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Min Liquidity Buffer (bps)
                </label>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={50}
                  value={form.minLiquidityBufferBps}
                  onChange={(e) =>
                    setForm({ ...form, minLiquidityBufferBps: parseInt(e.target.value) })
                  }
                  className="w-full accent-accent"
                />
                <p className="text-xs text-accent mt-1">
                  {form.minLiquidityBufferBps} bps ({form.minLiquidityBufferBps / 100}%)
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Max Protocols</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.maxProtocols}
                  onChange={(e) =>
                    setForm({ ...form, maxProtocols: parseInt(e.target.value) })
                  }
                  className="w-full bg-surface border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Rebalance Interval (seconds)
                </label>
                <input
                  type="number"
                  min={60}
                  value={form.rebalanceIntervalSecs}
                  onChange={(e) =>
                    setForm({ ...form, rebalanceIntervalSecs: parseInt(e.target.value) })
                  }
                  className="w-full bg-surface border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="por"
                  checked={form.requireProofOfReserve}
                  onChange={(e) =>
                    setForm({ ...form, requireProofOfReserve: e.target.checked })
                  }
                  className="accent-accent w-4 h-4"
                />
                <label htmlFor="por" className="text-sm text-gray-400">
                  Require Proof of Reserve
                </label>
              </div>
            </div>

            {formError && (
              <p className="text-danger text-sm mt-3">{formError}</p>
            )}

            <Button
              onClick={handlePropose}
              loading={proposePending}
              className="mt-4"
            >
              Submit Proposal
            </Button>
          </Card>

          {/* Compliance Events */}
          <Card>
            <h2 className="text-lg font-semibold mb-4 text-white">Compliance Events</h2>
            {complianceQuery.isLoading ? (
              <Spinner />
            ) : complianceEvents.length === 0 ? (
              <p className="text-gray-400 text-center py-6">No compliance events</p>
            ) : (
              <div className="space-y-3">
                {complianceEvents.map((e: any) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-red-900"
                  >
                    <span className="text-2xl">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {e.eventType}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(e.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {e.txHash && (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${e.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent shrink-0"
                      >
                        Tx →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
