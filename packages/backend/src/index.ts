import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "./db";
import { logger } from "./logger";
import { registry, apiRequestCounter } from "./metrics";
import { treasuryRouter } from "./routes/treasury";
import { analyticsRouter } from "./routes/analytics";
import { startIndexer } from "./services/eventIndexer";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors());
app.use(express.json());

// Request-ID middleware
app.use((req, res, next) => {
  const requestId = uuidv4();
  res.setHeader("X-Request-ID", requestId);
  (req as any).requestId = requestId;
  next();
});

// Request logging + metrics
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      requestId: (req as any).requestId,
    });
    apiRequestCounter.inc({ route: req.path, status: res.statusCode.toString() });
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/treasury", treasuryRouter);
app.use("/api/analytics", analyticsRouter);

// GET /health
app.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = "ok";
  } catch {
    checks.postgres = "error";
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL || "";
  checks.rpc = rpcUrl ? "configured" : "missing";

  const allOk = Object.values(checks).every((v) => v === "ok" || v === "configured");
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", checks });
});

// GET /metrics
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  app.listen(PORT, () => {
    logger.info(`ChainCFO backend listening on port ${PORT}`);
  });

  // Start event indexer
  startIndexer().catch((err) => {
    logger.error("Indexer failed to start", { error: (err as Error).message });
  });
}

main().catch((err) => {
  logger.error("Fatal error", { error: (err as Error).message });
  process.exit(1);
});

export default app;
