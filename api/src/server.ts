// SPDX-License-Identifier: Apache-2.0
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import client from "prom-client";
import { createClient } from "ioredis";
import { z } from "zod";

import { rateLimit } from "./mw/rateLimit.js";
import { requireFreshTs } from "./mw/requireFreshTs.js";
import { requireHmac } from "./mw/requireHmac.js";
import { riskScore } from "./risk/riskScore.js";
import { ProofStore, type ProofLine } from "./store/proof-store.js";
import { verifyMerkleProof } from "./crypto/merkle.js";
import healthRoutes from "./routes/health.js";
import { metricsGuard } from "./mw/metricsGuard.js";
import verifyRoutes from "./routes/verify.js";
import captureRoutes from "./routes/capture.js";
import correctionsRoutes from "./routes/corrections.js";
import disputesRoutes from "./routes/disputes.js";
import historyRoutes from "./routes/history.js";
import fheRoutes from "./routes/fhe.js";
import { AppendQueue } from "./store/append-queue.js";
import { registry, httpRequestsTotal, httpDuration } from "./metrics/registry.js";
import { scheduleDailyAnchor, setAnchorRedis } from "./cron/daily-anchor.js";
import { scheduleAnchorRetry } from "./cron/anchor-retry.js";

/* -----------------------------
 * Config (validated with Zod)
 * ---------------------------*/
const ByteLimit = z
  .string()
  .regex(/^\d+(kb|mb)?$/i)
  .or(z.number().int().positive())
  .transform((v) => String(v));

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATA_DIR: z.string().default(".data"),
  JSON_LIMIT: ByteLimit.default("256kb"),
  JSON_MAX_DEPTH: z.coerce.number().int().positive().max(10_000).default(100),
  REDIS_URL: z.string().url().optional().or(z.literal("")).default(""),
  LOG_LEVEL: z.enum(["fatal","error","warn","info","debug","trace","silent"]).default("info"),
  BADGE_SCRIPT_ORIGIN: z.string().default("'self'"),
  ALLOWED_ORIGINS: z.string().default("*"),
});
const CFG = EnvSchema.parse({
  PORT: process.env.PORT,
  DATA_DIR: process.env.DATA_DIR,
  JSON_LIMIT: process.env.JSON_LIMIT,
  JSON_MAX_DEPTH: process.env.JSON_MAX_DEPTH,
  REDIS_URL: process.env.REDIS_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
  BADGE_SCRIPT_ORIGIN: process.env.BADGE_SCRIPT_ORIGIN,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
});

/* -----------------------------
 * App bootstrap
 * ---------------------------*/
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

/* -----------------------------
 * Strict raw-body capture (for HMAC)
 * ---------------------------*/
type RawReq = Request & { _raw?: Buffer };
const MAX_RAW = (() => {
  const s = CFG.JSON_LIMIT.toLowerCase();
  if (s.endsWith("kb")) return parseInt(s) * 1024;
  if (s.endsWith("mb")) return parseInt(s) * 1024 * 1024;
  const n = parseInt(s);
  return Number.isFinite(n) ? n : 256 * 1024;
})();
app.use((req: Request, res: Response, next: NextFunction) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (c: Buffer) => {
    size += c.length;
    if (size > MAX_RAW) {
      return sendError(res, 413, "payload-too-large", "Raw body exceeds limit");
    }
    chunks.push(c);
  });
  req.on("end", () => {
    (req as RawReq)._raw = Buffer.concat(chunks);
    next();
  });
});

/* -----------------------------
 * Static + JSON parser
 * ---------------------------*/
app.use(express.static(path.join(process.cwd(), "api/public")));
app.use(express.json({ limit: CFG.JSON_LIMIT }));

/* -----------------------------
 * Logging
 * ---------------------------*/
const logger = pino({ level: CFG.LOG_LEVEL });
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID(),
  })
);
app.use((req, res, next) => {
  res.setHeader("X-Request-Id", (req as any).id);
  next();
});

/* -----------------------------
 * Security headers & CORS
 * ---------------------------*/
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", CFG.BADGE_SCRIPT_ORIGIN],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  })
);
app.use(cors({ origin: CFG.ALLOWED_ORIGINS }));

/* -----------------------------
 * Metrics (HTTP)
 * ---------------------------*/
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    httpRequestsTotal.inc({
      route: req.path,
      method: req.method,
      code: String(res.statusCode),
    });
    end();
  });
  next();
});
app.get("/metrics", metricsGuard(), async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

/* -----------------------------
 * Extra metrics (queue/leader)
 * ---------------------------*/
const appendQueueState = new client.Gauge({
  name: "privora_appendqueue_state",
  help: "Append queue state (0=off,1=init,2=running,3=closing)",
  registers: [registry],
});
const leaderGauge = new client.Gauge({
  name: "privora_leader_is_leader",
  help: "1 if this instance is leader, else 0",
  labelNames: ["instance_id"],
  registers: [registry],
});
const instanceId = process.env.HOSTNAME || `inst-${Math.random().toString(16).slice(2)}`;

/* -----------------------------
 * State (Proof store, Redis, Queue)
 * ---------------------------*/
const store = new ProofStore(CFG.DATA_DIR);
let redis: ReturnType<typeof createClient> | null = null;
let appendWorker: AppendQueue | null = null;

if (CFG.REDIS_URL) {
  appendQueueState.set(1);
  redis = new createClient({ url: CFG.REDIS_URL });
  redis.connect().catch((err) => logger.error({ err }, "Redis connection error"));
  appendWorker = new AppendQueue(CFG.DATA_DIR, redis);
  await appendWorker.init();
  appendQueueState.set(2);
  setAnchorRedis(redis);
  leaderGauge.set({ instance_id: instanceId }, 1); // AppendQueue elects leader internally; assume leader when started
} else {
  appendQueueState.set(0);
  leaderGauge.set({ instance_id: instanceId }, 0);
}

/* -----------------------------
 * In-memory job queue (fallback)
 * ---------------------------*/
type Job = { id: string; payload: unknown; createdAt: number };
const queue: Job[] = [];
function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}
function depthOf(x: unknown, depth = 0): number {
  if (!isObject(x)) return depth;
  if (depth > CFG.JSON_MAX_DEPTH) return depth;
  if (Array.isArray(x)) return x.reduce((m, v) => Math.max(m, depthOf(v, depth + 1)), depth);
  return Object.values(x).reduce((m, v) => Math.max(m, depthOf(v, depth + 1)), depth + 1);
}
function pushJob(payload: unknown): Job {
  const job: Job = { id: randomUUID(), payload, createdAt: Date.now() };
  queue.push(job);
  return job;
}
function popJob(): Job | undefined {
  return queue.shift();
}

/* -----------------------------
 * Routes
 * ---------------------------*/
app.use(healthRoutes);
app.use(verifyRoutes());
app.use(historyRoutes());
app.use(correctionsRoutes(store));
app.use(disputesRoutes(store));
app.use(captureRoutes(store));
app.use("/api", fheRoutes());

/* Submit */
app.post(
  "/submit",
  rateLimit({
    bucketSize: Number(process.env.RL_BUCKET || 80),
    refillPerSec: Number(process.env.RL_REFILL || 5),
  }),
  (req, res) => {
    const raw = (req.body as any)?.payload;
    if (typeof raw === "undefined") return sendError(res, 400, "missing-payload");
    const size = Buffer.byteLength(JSON.stringify(raw) || "");
    if (size > 256 * 1024) return sendError(res, 413, "payload-too-large");
    const d = depthOf(raw);
    if (d > CFG.JSON_MAX_DEPTH) {
      return sendError(res, 400, "payload-too-deep", `depth=${d}`);
    }
    const score = riskScore({ payloadSize: size });
    if (score >= 60) {
      return res.status(429).json({
        ok: false,
        error: { code: "challenge", detail: "pow", meta: { difficulty: 6 } },
      });
    }
    const job = pushJob(raw);
    return res.json({ ok: true, jobId: job.id });
  }
);

/* Next job */
app.post("/next-job", requireFreshTs(), requireHmac(), (_req, res) => {
  const job = popJob();
  if (!job) return res.json({ ok: true, job: null });
  return res.json({ ok: true, job: { id: job.id, payload: job.payload } });
});

/* Proof store */
app.post("/proof", requireFreshTs(), requireHmac(), async (req, res) => {
  const { jobId, proofHash, manifestHash } = (req.body || {}) as {
    jobId?: string;
    proofHash?: string;
    manifestHash?: string;
  };
  if (!jobId || !proofHash) return sendError(res, 400, "jobId-or-proofHash-missing");

  const line: ProofLine = {
    jobId: String(jobId),
    proofHash: String(proofHash),
    manifestHash: manifestHash ? String(manifestHash) : undefined,
    createdAt: Date.now(),
  };
  const file = store.currentFilePath;
  const serialized = JSON.stringify(line);
  const eventId = (req.headers["x-request-id"] as string) || randomUUID();
  try {
    if (appendWorker) {
      await appendWorker.enqueue(file, serialized, eventId);
    } else {
      await store.append(line);
    }
    return res.json({ ok: true, stored: true });
  } catch (err: unknown) {
    return sendError(res, 500, "append-failed", err instanceof Error ? err.message : undefined);
  }
});

/* Proofs snapshot */
app.get("/proofs", (_req, res) => {
  const snap = store.currentRoot();
  return res.json({
    ok: true,
    info: {
      day: snap?.day,
      leafCount: snap?.leafCount ?? 0,
      merkleRoot: snap?.merkleRoot ?? null,
      file: snap?.file ?? null,
    },
  });
});

/* Proof verify */
app.get("/proofs/verify", (req, res) => {
  try {
    const leaf = String(req.query.leaf || "");
    const root = String(req.query.root || "");
    const branch = JSON.parse(String(req.query.branch || "[]"));
    const ok = verifyMerkleProof(leaf as `0x${string}`, branch, root as `0x${string}`);
    return res.json({ ok, verified: ok });
  } catch (e: unknown) {
    return sendError(res, 400, "bad-params", e instanceof Error ? e.message : undefined);
  }
});

/* -----------------------------
 * Global error handler
 * ---------------------------*/
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : "internal";
  logger.error(err);
  return sendError(res, 500, "internal", msg);
});

/* -----------------------------
 * Schedules
 * ---------------------------*/
scheduleDailyAnchor(store);
scheduleAnchorRetry(redis);

/* -----------------------------
 * Graceful shutdown
 * ---------------------------*/
async function shutdown() {
  try {
    appendQueueState.set(3);
    await appendWorker?.close();
    if (redis) await redis.quit();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/* -----------------------------
 * Start server
 * ---------------------------*/
app.listen(CFG.PORT, () => logger.info({ port: CFG.PORT }, "[api] listening"));

/* -----------------------------
 * Helpers
 * ---------------------------*/
function sendError(
  res: Response,
  status: number,
  code: string,
  detail?: string
) {
  return res.status(status).json({
    ok: false,
    error: { code, detail },
  });
}
