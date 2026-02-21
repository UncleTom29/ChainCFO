import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { logger } from "../logger";

export const analyticsRouter = Router();

function successResponse(data: unknown) {
  return { success: true, data, timestamp: Date.now() };
}

function errorResponse(message: string) {
  return { success: false, error: message, timestamp: Date.now() };
}

// GET /api/analytics/apy-history
analyticsRouter.get("/apy-history", async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const reports = await prisma.allocationReport.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
      include: { allocations: true },
    });

    const timeSeries = reports.map((r) => {
      const totalBps = r.allocations.reduce((sum, a) => sum + a.basisPoints, 0);
      const weightedApy = totalBps > 0
        ? r.allocations.reduce((sum, a) => sum + (a.apy * a.basisPoints) / totalBps, 0)
        : 0;
      return {
        date: r.timestamp.toISOString(),
        weightedApy: parseFloat(weightedApy.toFixed(4)),
        tvlUsd: r.totalValueUsd,
      };
    });

    res.json(successResponse(timeSeries));
  } catch (err) {
    logger.error("GET /apy-history error", { error: (err as Error).message });
    res.status(500).json(errorResponse("Internal server error"));
  }
});

// GET /api/analytics/protocol-breakdown
analyticsRouter.get("/protocol-breakdown", async (_req: Request, res: Response) => {
  try {
    const latestReport = await prisma.allocationReport.findFirst({
      orderBy: { timestamp: "desc" },
      include: { allocations: true },
    });

    if (!latestReport) {
      return res.json(successResponse([]));
    }

    const totalBps = latestReport.allocations.reduce((sum, a) => sum + a.basisPoints, 0);
    const breakdown = latestReport.allocations.map((a) => ({
      protocol: a.protocolName,
      percentage: totalBps > 0 ? ((a.basisPoints / totalBps) * 100).toFixed(2) : "0",
      apy: a.apy,
      riskScore: a.riskScore,
    }));

    return res.json(successResponse(breakdown));
  } catch (err) {
    logger.error("GET /protocol-breakdown error", { error: (err as Error).message });
    return res.status(500).json(errorResponse("Internal server error"));
  }
});

// GET /api/analytics/llm-decisions
analyticsRouter.get("/llm-decisions", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 50);
    const reports = await prisma.allocationReport.findMany({
      take: limit,
      orderBy: { timestamp: "desc" },
      select: {
        id: true,
        timestamp: true,
        totalValueUsd: true,
        llmRationale: true,
        txHash: true,
        allocations: {
          select: {
            protocolName: true,
            basisPoints: true,
            apy: true,
            riskScore: true,
          },
        },
      },
    });

    res.json(successResponse(reports));
  } catch (err) {
    logger.error("GET /llm-decisions error", { error: (err as Error).message });
    res.status(500).json(errorResponse("Internal server error"));
  }
});

// GET /api/analytics/compliance-events
analyticsRouter.get("/compliance-events", async (_req: Request, res: Response) => {
  try {
    const events = await prisma.treasuryEvent.findMany({
      where: { eventType: "COMPLIANCE_VIOLATION" },
      orderBy: { timestamp: "desc" },
      take: 50,
    });
    res.json(successResponse(events));
  } catch (err) {
    logger.error("GET /compliance-events error", { error: (err as Error).message });
    res.status(500).json(errorResponse("Internal server error"));
  }
});
