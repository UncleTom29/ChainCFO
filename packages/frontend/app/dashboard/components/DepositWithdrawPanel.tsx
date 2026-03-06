"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fetchUserPosition } from "@/lib/api";
import {
  TREASURY_VAULT_ADDRESS,
  TREASURY_VAULT_ABI,
  ERC20_ABI,
  USDC_SEPOLIA,
} from "@/lib/contracts";

export function DepositWithdrawPanel() {
  const { address, isConnected } = useAccount();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");

  const positionQuery = useQuery({
    queryKey: ["user-position", address],
    queryFn: () => fetchUserPosition(address!),
    enabled: !!address,
    refetchInterval: 15000,
  });
  const position = positionQuery.data?.data;

  // Approve USDC
  const { writeContract: approveWrite, data: approveTxHash } = useWriteContract();
  const { isLoading: approveLoading } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Deposit
  const { writeContract: depositWrite, data: depositTxHash } = useWriteContract();
  const { isLoading: depositLoading, isSuccess: depositSuccess } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  // Withdraw
  const { writeContract: withdrawWrite, data: withdrawTxHash } = useWriteContract();
  const { isLoading: withdrawLoading, isSuccess: withdrawSuccess } =
    useWaitForTransactionReceipt({ hash: withdrawTxHash });

  async function handleDeposit() {
    if (!TREASURY_VAULT_ADDRESS || !depositAmount) return;
    try {
      const amount = parseUnits(depositAmount, 6);
      // Step 1: approve
      approveWrite(
        {
          address: USDC_SEPOLIA,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [TREASURY_VAULT_ADDRESS, amount],
        },
        {
          onSuccess: () => {
            // Step 2: deposit after approval
            depositWrite(
              {
                address: TREASURY_VAULT_ADDRESS!,
                abi: TREASURY_VAULT_ABI,
                functionName: "deposit",
                args: [amount],
              },
              {
                onSuccess: () => toast.success("Deposit successful!"),
                onError: (e) => toast.error(`Deposit failed: ${e.message}`),
              }
            );
          },
          onError: (e) => toast.error(`Approval failed: ${e.message}`),
        }
      );
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleWithdraw() {
    if (!TREASURY_VAULT_ADDRESS || !withdrawShares) return;
    try {
      const shares = parseUnits(withdrawShares, 6);
      withdrawWrite(
        {
          address: TREASURY_VAULT_ADDRESS,
          abi: TREASURY_VAULT_ABI,
          functionName: "withdraw",
          args: [shares, BigInt(0)],
        },
        {
          onSuccess: () => toast.success("Withdrawal successful!"),
          onError: (e) => toast.error(`Withdrawal failed: ${e.message}`),
        }
      );
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (!isConnected) {
    return (
      <Card>
        <p className="text-gray-400 text-center py-8">
          Connect your wallet to deposit or withdraw
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4 text-white">Your Position</h2>

      {/* Position summary */}
      {position && (
        <div className="bg-surface rounded-lg p-4 mb-4 text-sm">
          <div className="flex justify-between text-gray-400 mb-1">
            <span>Shares</span>
            <span className="text-white">{parseFloat(position.shares || "0").toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Ownership</span>
            <span className="text-accent">{position.ownershipPercent}%</span>
          </div>
        </div>
      )}

      <Tabs.Root defaultValue="deposit">
        <Tabs.List className="flex border-b border-gray-700 mb-4">
          <Tabs.Trigger
            value="deposit"
            className="flex-1 pb-2 text-sm font-medium text-gray-400 data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent"
          >
            Deposit
          </Tabs.Trigger>
          <Tabs.Trigger
            value="withdraw"
            className="flex-1 pb-2 text-sm font-medium text-gray-400 data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent"
          >
            Withdraw
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="deposit" className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">USDC Amount</label>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-surface border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            />
          </div>
          <Button
            onClick={handleDeposit}
            loading={approveLoading || depositLoading}
            className="w-full"
          >
            Approve &amp; Deposit
          </Button>
        </Tabs.Content>

        <Tabs.Content value="withdraw" className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Shares to Withdraw</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={withdrawShares}
                onChange={(e) => setWithdrawShares(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-surface border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => setWithdrawShares(position?.shares ?? "")}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white"
              >
                Max
              </button>
            </div>
          </div>
          <Button
            onClick={handleWithdraw}
            loading={withdrawLoading}
            variant="secondary"
            className="w-full"
          >
            Withdraw
          </Button>
        </Tabs.Content>
      </Tabs.Root>
    </Card>
  );
}
