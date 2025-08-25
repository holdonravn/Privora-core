// SPDX-License-Identifier: Apache-2.0
// api/src/server.ts  
import express from "express";
import helmet from "helmet";
import cors from "cors";
import client from "prom-client";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { rateLimit } from "./mw/rateLimit.js";
import { requireFreshTs } from "./mw/requireFreshTs.js";
import { requireHmac } from "./mw/requireHmac.js";
import { riskScore } from "./risk/riskScore.js";
import { ProofStore, type ProofLine } from "./store/proof-store.js";
import { verifyMerkleProof } from "./crypto/merkle.js";
import healthRoutes from "./routes/health.js";
import { scheduleDailyRoot } from "./cron/daily-root.js";

// New routes
import captureRoutes from "./routes/capture.js";
import verifyRoutes from "./routes/verify.js";
import correctionsRoutes from "./routes/corrections.js";
import disputesRoutes from "./routes/disputes.js";
import historyRoutes from "./routes/history.js";

// ---------- Config ----------
const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = process.env.DATA_DIR || ".data";
const JSON_LIMIT = process.env.JSON_LIMIT || "256kb";
const MAX_DEPTH = Number(process.env.JSON_MAX_DEPTH || 100);

// ---------- App ----------
const app = express();
app.disable("x-powered-by");

// Trust reverse proxies (accurate IPs for rate-limit @ k8s/ingress)
app.set("trust proxy", true);

// Static files (badge.js, demo pages, etc.)
app.use(express.static(path.join(process.cwd(), "api/public")));

app.use(express.json({ limit: JSON_LIMIT }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || "*" }));

// ---------- Metrics ----------
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const reqCounter = new client.Counter({
  name: "privora_requests_total",
  help: "Total HTTP requests",
  labelNames: ["route", "method", "code"],
  registers: [registry],
});
const proofsStored = new client.Counter({
  name: "privora_proofs_stored_total",
  help: "Total proofs stored (NDJSON append)",
  registers: [registry],
});
const rateLimited = new client.Counter({
  name: "privora_rate_limited_total",
  help: "429 count",
  registers: [registry],
});
const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Request duration histogram",
  buckets: [0.01, 0.05, 0.1, 0.3, 0.6, 1, 2, 5],
  registers: [registry],
});
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    reqCounter.inc({ route: req.path, method: req.method, code: String(res.statusCode) });
    end();
  });
  next();
});

// ---------- State ----------
const store = new ProofStore(DATA_DIR);
type Job = { id: string; payload: any; createdAt: number };
const queue: Job[] = [];
const queueDepthGauge = new client.Gauge({
  name: "privora_queue_depth",
  help: "In-memory queue depth",
  registers: [registry],
});
function depthOf(x: any, depth = 0): number {
  if (x === null || typeof x !== "object") return depth;
  if (depth > MAX_DEPTH) return depth;
  if (Array.isArray(x)) return x.reduce((m, v) => Math.max(m, depthOf(v, depth + 1)), depth);
  return Object.values(x).reduce((m, v) => Math.max(m, depthOf(v, depth + 1)), depth + 1);
}
function pushJob(payload: any): Job {
  const job: Job = { id: randomUUID(), payload, createdAt: Date.now() };
  queue.push(job);
  queueDepthGauge.set(queue.length);
  return job;
}
function popJob(): Job | undefined {
  const job = queue.shift();
  queueDepthGauge.set(queue.length);
  return job;
}

// ---------- Routes ----------
app.use(healthRoutes);
app.use(verifyRoutes());
app.use(historyRoutes());
app.use(correctionsRoutes(store));
app.use(disputesRoutes(store));
app.use(captureRoutes(store));

/** SUBMIT — rate-limit + payload guard + risk gating */
app.post(
  "/submit",
  rateLimit({
    bucketSize: Number(process.env.RL_BUCKET || 80),
    refillPerSec: Number(process.env.RL_REFILL || 5),
  }),
  (req, res) => {
    const raw = req.body?.payload;
    if (typeof raw === "undefined") return res.status(400).json({ ok: false, error: "missing-payload" });
    const size = Buffer.byteLength(JSON.stringify(raw) || "");
    if (size > 256 * 1024) return res.status(413).json({ ok: false, error: "payload-too-large" });
    const d = depthOf(raw);
    if (d > MAX_DEPTH) return res.status(400).json({ ok: false, error: "payload-too-deep", depth: d });

    const score = riskScore({ payloadSize: size });
    if (score >= 60) return res.status(429).json({ ok: false, challenge: { type: "pow", difficulty: 6 } });

    const job = pushJob(raw);
    return res.json({ ok: true, jobId: job.id });
  }
);

/** NEXT-JOB — HMAC + fresh timestamp */
app.post("/next-job", requireFreshTs(), requireHmac(), (_req, res) => {
  const job = popJob();
  if (!job) return res.json({ ok: true, job: null });
  return res.json({ ok: true, job: { id: job.id, payload: job.payload } });
});

/** PROOF — HMAC + fresh timestamp + NDJSON append */
app.post("/proof", requireFreshTs(), requireHmac(), async (req, res) => {
  const { jobId, proofHash, manifestHash } = req.body ?? {};
  if (!jobId || !proofHash) return res.status(400).json({ ok: false, error: "jobId & proofHash required" });

  const line: ProofLine = {
    jobId: String(jobId),
    proofHash: String(proofHash),
    manifestHash: manifestHash ? String(manifestHash) : undefined,
    createdAt: Date.now(),
  };
  await store.append(line);
  proofsStored.inc();
  return res.json({ ok: true, stored: true });
});

/** PROOFS SNAPSHOT */
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

/** INCLUSION VERIFY (off-chain) */
app.get("/proofs/verify", (req, res) => {
  try {
    const leaf = String(req.query.leaf || "");
    const root = String(req.query.root || "");
    const branch = JSON.parse(String(req.query.branch || "[]"));
    const ok = verifyMerkleProof(leaf as `0x${string}`, branch, root as `0x${string}`);
    return res.json({ ok, verified: ok });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "bad params" });
  }
});

/** METRICS */
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

// ---------- Boot ----------
scheduleDailyRoot();
app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
