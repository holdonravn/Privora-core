// SPDX-License-Identifier: Apache-2.0
// api/src/server.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";

import { rateLimit } from "./mw/rateLimit.js";
import { requireFreshTs } from "./mw/requireFreshTs.js";
import { requireHmac } from "./mw/requireHmac.js";
import { riskScore } from "./risk/riskScore.js";
import { ProofStore, type ProofLine } from "./store/proof-store.js";
import { verifyMerkleProof } from "./crypto/merkle.js";
import healthRoutes from "./routes/health.js";
import { scheduleDailyRoot } from "./cron/daily-root.js";
import verifyRoutes from "./routes/verify.js";
import captureRoutes from "./routes/capture.js";
import correctionsRoutes from "./routes/corrections.js";
import disputesRoutes from "./routes/disputes.js";
import historyRoutes from "./routes/history.js";
import fheRoutes from "./routes/fhe.js";
import { metricsGuard } from "./mw/metricsGuard.js";
import { httpDuration, reqCounter, registry } from "./metrics.js";
import { scheduleAnchorRoot } from "./cron/anchor-root.js";

const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = process.env.DATA_DIR || ".data";
const JSON_LIMIT = process.env.JSON_LIMIT || "256kb";
const MAX_DEPTH = Number(process.env.JSON_MAX_DEPTH || 100);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

// ---- RAW BODY CAPTURE (HMAC) + BOYUT LİMİTİ ----
const MAX_RAW = (() => {
  const s = String(JSON_LIMIT).toLowerCase();
  if (s.endsWith("kb")) return parseInt(s) * 1024;
  if (s.endsWith("mb")) return parseInt(s) * 1024 * 1024;
  const n = parseInt(s);
  return Number.isFinite(n) ? n : 256 * 1024;
})();

app.use((req, res, next) => {
  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;
  req.on("data", (c) => {
    if (aborted) return;
    size += c.length;
    if (size > MAX_RAW) {
      aborted = true;
      res.status(413).json({ ok: false, error: "payload-too-large" });
      // bağlantıyı kapat – end yine tetiklenirse guard var
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => {
    if (aborted) return;
    (req as any)._raw = Buffer.concat(chunks);
    next();
  });
});

// ---- STATIC + JSON PARSE ----
app.use(express.static(path.join(process.cwd(), "api/public")));
app.use(express.json({ limit: JSON_LIMIT }));

// ---- LOGGING + REQUEST-ID ----
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
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

// ---- SECURITY (Helmet/CSP) + CORS ----
const BADGE_ORIGIN = process.env.BADGE_SCRIPT_ORIGIN || "'self'";
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", BADGE_ORIGIN],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  })
);
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || "*" }));

// ---- METRICS: REQUEST DURATION & COUNTERS ----
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    reqCounter.inc({
      route: req.path,
      method: req.method,
      code: String(res.statusCode),
    });
    end();
  });
  next();
});

// ---- STATE ----
const store = new ProofStore(DATA_DIR);
type Job = { id: string; payload: any; createdAt: number };
const queue: Job[] = [];

function depthOf(x: any, depth = 0): number {
  if (x === null || typeof x !== "object") return depth;
  if (depth > MAX_DEPTH) return depth;
  if (Array.isArray(x))
    return x.reduce((m, v) => Math.max(m, depthOf(v, depth + 1)), depth);
  return Object.values(x).reduce(
    (m, v) => Math.max(m, depthOf(v, depth + 1)),
    depth + 1
  );
}
function pushJob(payload: any): Job {
  const job: Job = { id: randomUUID(), payload, createdAt: Date.now() };
  queue.push(job);
  return job;
}
function popJob(): Job | undefined {
  return queue.shift();
}

// ---- ROUTES ----
app.use(healthRoutes);
app.use(verifyRoutes());
app.use(historyRoutes());
app.use(correctionsRoutes(store));
app.use(disputesRoutes(store));
app.use(captureRoutes(store));
// FHE ingest'i /api altında sun
app.use("/api", fheRoutes());

app.post(
  "/submit",
  rateLimit({
    bucketSize: Number(process.env.RL_BUCKET || 80),
    refillPerSec: Number(process.env.RL_REFILL || 5),
  }),
  (req, res) => {
    const raw = req.body?.payload;
    if (typeof raw === "undefined")
      return res.status(400).json({ ok: false, error: "missing-payload" });
    const size = Buffer.byteLength(JSON.stringify(raw) || "");
    if (size > 256 * 1024)
      return res
        .status(413)
        .json({ ok: false, error: "payload-too-large" });
    const d = depthOf(raw);
    if (d > MAX_DEPTH)
      return res
        .status(400)
        .json({ ok: false, error: "payload-too-deep", depth: d });

    const score = riskScore({ payloadSize: size });
    if (score >= 60)
      return res
        .status(429)
        .json({ ok: false, challenge: { type: "pow", difficulty: 6 } });

    const job = pushJob(raw);
    return res.json({ ok: true, jobId: job.id });
  }
);

app.post("/next-job", requireFreshTs(), requireHmac(), (_req, res) => {
  const job = popJob();
  if (!job) return res.json({ ok: true, job: null });
  return res.json({ ok: true, job: { id: job.id, payload: job.payload } });
});

app.post("/proof", requireFreshTs(), requireHmac(), async (req, res) => {
  const { jobId, proofHash, manifestHash } = req.body ?? {};
  if (!jobId || !proofHash)
    return res
      .status(400)
      .json({ ok: false, error: "jobId & proofHash required" });
  const line: ProofLine = {
    jobId: String(jobId),
    proofHash: String(proofHash),
    manifestHash: manifestHash ? String(manifestHash) : undefined,
    createdAt: Date.now(),
  };
  await store.append(line);
  return res.json({ ok: true, stored: true });
});

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

app.get("/proofs/verify", (req, res) => {
  try {
    const leaf = String(req.query.leaf || "");
    const root = String(req.query.root || "");
    const branch = JSON.parse(String(req.query.branch || "[]"));
    const ok = verifyMerkleProof(
      leaf as `0x${string}`,
      branch,
      root as `0x${string}`
    );
    return res.json({ ok, verified: ok });
  } catch (e: any) {
    return res
      .status(400)
      .json({ ok: false, error: e?.message || "bad params" });
  }
});

// ---- METRICS (Custom Registry) ----
app.get("/metrics", metricsGuard(), async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

// ---- GLOBAL ERROR HANDLER ----
app.use((err: any, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ ok: false, error: "internal" });
});

// ---- BOOT ----
scheduleDailyRoot();
scheduleAnchorRoot(store);
app.listen(PORT, () => logger.info({ port: PORT }, "[api] listening"));
