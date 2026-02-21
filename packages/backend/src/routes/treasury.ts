import { Router, Request, Response } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { prisma } from "../db";
import { logger } from "../logger";

export const treasuryRouter = Router();

const TREASURY_ABI = [
  "function getTVL() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function userShares(address) view returns (uint256)",
];

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "");
}

function successResponse(data: unknown) {
  return { success: true, data, timestamp: Date.now() };
}

function errorResponse(message: string) {
  return { success: false, error: message, timestamp: Date.now() };
}

// GET /api/treasury/stats
treasuryRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const provider = getProvider();
    const vaultAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "";

    let tvlUsdFormatted = "0";
    let totalSharesFormatted = "0";

    if (vaultAddress && ethers.isAddress(vaultAddress)) {
      const vault = new ethers.Contract(vaultAddress, TREASURY_ABI, provider);
      try {
        const [tvl, shares] = await Promise.all([
          vault.getTVL(),
          vault.totalShares(),
        ]);
        tvlUsdFormatted = ethers.formatUnits(tvl, 6);
        totalSharesFormatted = ethers.formatUnits(shares, 6);
      } catch (contractErr) {
        logger.warn("Could not read vault contract", { error: (contractErr as Error).message });
      }
    }

    const latestReport = await prisma.allocationReport.findFirst({
      orderBy: { timestamp: "desc" },
      include: { allocations: true },
    });

    const nextRebalanceMs = latestReport
      ? new Date(latestReport.timestamp).getTime() + 4 * 60 * 60 * 1000
      : null;

    res.json(successResponse({
      tvlUsd: tvlUsdFormatted,
      totalShares: totalSharesFormatted,
      currentAllocations: latestReport?.allocations ?? [],
      lastRebalanced: latestReport?.timestamp ?? null,
      nextRebalance: nextRebalanceMs,
    }));
  } catch (err) {
    logger.error("GET /stats error", { error: (err as Error).message });
    res.status(500).json(errorResponse("Internal server error"));
  }
});

// GET /api/treasury/history
treasuryRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const reports = await prisma.allocationReport.findMany({
      take: limit,
      orderBy: { timestamp: "desc" },
      include: { allocations: true },
    });
    res.json(successResponse(reports));
  } catch (err) {
    logger.error("GET /history error", { error: (err as Error).message });
    res.status(500).json(errorResponse("Internal server error"));
  }
});

// GET /api/treasury/user/:address
treasuryRouter.get("/user/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json(errorResponse("Invalid address"));
    }

    const provider = getProvider();
    const vaultAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "";

    let userSharesBn = BigInt(0);
    let totalSharesBn = BigInt(0);

    if (vaultAddress && ethers.isAddress(vaultAddress)) {
      const vault = new ethers.Contract(vaultAddress, TREASURY_ABI, provider);
      try {
        [userSharesBn, totalSharesBn] = await Promise.all([
          vault.userShares(address),
          vault.totalShares(),
        ]);
      } catch (contractErr) {
        logger.warn("Could not read user shares", { error: (contractErr as Error).message });
      }
    }

    const ownership = totalSharesBn > BigInt(0)
      ? (Number(userSharesBn) / Number(totalSharesBn)) * 100
      : 0;

    return res.json(successResponse({
      address,
      shares: userSharesBn.toString(),
      ownershipPercent: ownership.toFixed(4),
    }));
  } catch (err) {
    logger.error("GET /user error", { error: (err as Error).message });
    return res.status(500).json(errorResponse("Internal server error"));
  }
});

const DepositSchema = z.object({
  amount: z.string().min(1),
  userAddress: z.string().min(1),
});

// POST /api/treasury/deposit
treasuryRouter.post("/deposit", async (req: Request, res: Response) => {
  try {
    const parsed = DepositSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse(parsed.error.message));
    }
    const { amount, userAddress } = parsed.data;
    const vaultAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "";
    const vaultIface = new ethers.Interface(["function deposit(uint256 amount)"]);
    const txCalldata = vaultIface.encodeFunctionData("deposit", [
      ethers.parseUnits(amount, 6),
    ]);
    return res.json(successResponse({ to: vaultAddress, data: txCalldata, userAddress }));
  } catch (err) {
    logger.error("POST /deposit error", { error: (err as Error).message });
    return res.status(500).json(errorResponse("Internal server error"));
  }
});

const WithdrawSchema = z.object({
  shares: z.string().min(1),
  userAddress: z.string().min(1),
});

// POST /api/treasury/withdraw
treasuryRouter.post("/withdraw", async (req: Request, res: Response) => {
  try {
    const parsed = WithdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse(parsed.error.message));
    }
    const { shares, userAddress } = parsed.data;
    const vaultAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "";
    const vaultIface = new ethers.Interface([
      "function withdraw(uint256 shares, uint256 minAmountOut)",
    ]);
    const txCalldata = vaultIface.encodeFunctionData("withdraw", [
      ethers.parseUnits(shares, 6),
      BigInt(0),
    ]);
    return res.json(successResponse({ to: vaultAddress, data: txCalldata, userAddress }));
  } catch (err) {
    logger.error("POST /withdraw error", { error: (err as Error).message });
    return res.status(500).json(errorResponse("Internal server error"));
  }
});
