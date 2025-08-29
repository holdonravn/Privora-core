// SPDX-License-Identifier: Apache-2.0
// api/src/server.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID, createHash, timingSafeEqual, createHmac } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import Redis from "ioredis";
import client from "prom-client";
import { z } from "zod";

// ---- Optional existing modules (mevcutta varsa kullanılır) -----------------
import { rateLimit } from "./mw/rateLimit.js";               // varsa kullanılır; yoksa perKeyRL kullanın
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

// ============================================================================
// 0) CONFIG (zod ile doğrulama)
// ============================================================================
const EnvSchema = z.object({
  PORT: z.string().default("4000"),
  DATA_DIR: z.string().default(".data"),
  JSON_LIMIT: z.string().default("256kb"),
  JSON_MAX_DEPTH: z.string().default("100"),
  LOG_LEVEL: z.string().default("info"),
  ALLOWED_ORIGINS: z.string().default("*"),
  BADGE_SCRIPT_ORIGIN: z.string().default("'self'"),
  REDIS_URL: z.string().optional().default(""),
  // HMAC / Nonce
  REQUIRE_REDIS_NONCE: z.string().optional().default("false"),
  NONCE_TTL_SEC: z.string().default("600"),
  // HMAC key kaynağı
  ALLOW_ENV_KEYS: z.string().optional().default("true"), // prod'da false önerilir
  HMAC_KEYS: z.string().optional().default(""),          // "id=secret,id2=secret2"
  API_SHARED_SECRET: z.string().optional().default(""),
  // RL
  RL_BUCKET: z.string().default("80"),
  RL_REFILL: z.string().default("5"),
  // Timeouts
  HEADERS_TIMEOUT_MS: z.string().default("10000"),
  REQUEST_TIMEOUT_MS: z.string().default("15000"),
  KEEPALIVE_TIMEOUT_MS: z.string().default("5000"),
});
const env = EnvSchema.parse(process.env);

const PORT = Number(env.PORT);
const DATA_DIR = env.DATA_DIR;
const JSON_LIMIT = env.JSON_LIMIT;
const MAX_DEPTH = Number(env.JSON_MAX_DEPTH);
const REDIS_URL = env.REDIS_URL;

// ============================================================================
// 1) APP & LOGGING
// ============================================================================
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

const logger = pino({ level: env.LOG_LEVEL });
app.use(pinoHttp({ logger, genReqId: req => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use((req, res, next) => { res.setHeader("X-Request-Id", (req as any).id); next(); });

// ============================================================================
// 2) RAW BODY CAPTURE (HMAC için) + boyut sınırı
// ============================================================================
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
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_RAW) {
      res.status(413).json({ ok: false, error: "payload-too-large" });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => { (req as any)._raw = Buffer.concat(chunks); next(); });
});

// ============================================================================
// 3) SECURITY HEADERS + CORS
// ============================================================================
const BADGE_ORIGIN = env.BADGE_SCRIPT_ORIGIN;
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'", BADGE_ORIGIN],
    "img-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'none'"],
  },
}));
app.use(helmet.referrerPolicy({ policy: "no-referrer" }));
app.use(helmet.permittedCrossDomainPolicies());
app.use(helmet.crossOriginResourcePolicy({ policy: "same-site" }));
app.use(cors({ origin: env.ALLOWED_ORIGINS.split(",").map(s => s.trim()) }));

// ============================================================================
// 4) STATIC + JSON
// ============================================================================
app.use(express.static(path.join(process.cwd(), "api/public")));
app.use(express.json({ limit: JSON_LIMIT }));

// ============================================================================
// 5) REDIS & HELPERS
// ============================================================================
const redis = REDIS_URL ? new Redis(REDIS_URL) : null;
if (redis) {
  redis.on("error", (err) => logger.error({ err }, "redis-error"));
}

// HMAC KeyProvider (Redis öncelikli, env fallback opsiyonel)
async function getHmacSecret(keyId: string): Promise<string | null> {
  // Redis: privora:hmac:<keyId> → secret
  if (redis) {
    const v = await redis.get(`privora:hmac:${keyId}`);
    if (v) return v;
  }
  if (env.ALLOW_ENV_KEYS === "true") {
    if (env.API_SHARED_SECRET && keyId === "default") return env.API_SHARED_SECRET;
    // HMAC_KEYS "id=secret,id2=secret2"
    const map = new Map<string, string>();
    for (const p of (env.HMAC_KEYS || "").split(",").map(s => s.trim()).filter(Boolean)) {
      const [id, sec] = p.split("=");
      if (id && sec) map.set(id, sec);
    }
    return map.get(keyId) || null;
  }
  return null;
}

// Nonce Store (Redis zorunlu modu)
async function nonceCheckAndSet(key: string, ttlSec: number): Promise<boolean> {
  if (redis) {
    const ok = await redis.set(key, String(Date.now()), "NX", "EX", ttlSec);
    return ok === "OK";
  }
  if (env.REQUIRE_REDIS_NONCE === "true") return false; // prod modda Redis şart
  // dev fallback (in-mem)
  const memKey = `.cache/nonce-${createHash("sha256").update(key).digest("hex")}`;
  try {
    if (fs.existsSync(memKey)) return false;
    fs.writeFileSync(memKey, "1");
    setTimeout(() => { try { fs.unlinkSync(memKey); } catch {} }, ttlSec * 1000).unref();
    return true;
  } catch { return false; }
}

// ============================================================================
// 6) PROMETHEUS
// ============================================================================
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new client.Counter({
  name: "privora_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["route", "method", "code"],
  registers: [registry],
});
const httpDuration = new client.Histogram({
  name: "privora_http_request_duration_seconds",
  help: "Request duration histogram",
  buckets: [0.01, 0.05, 0.1, 0.3, 0.6, 1, 2, 5],
  registers: [registry],
});
const auth401 = new client.Counter({ name: "privora_auth_401_total", help: "401 count", registers: [registry] });
const forbid403 = new client.Counter({ name: "privora_forbid_403_total", help: "403 count", registers: [registry] });
const throttle429 = new client.Counter({ name: "privora_throttle_429_total", help: "429 count", registers: [registry] });
const appendErrors = new client.Counter({ name: "privora_append_errors_total", help: "append errors", registers: [registry] });
const leaderGauge = new client.Gauge({ name: "privora_leader_is_leader", help: "1 if leader", registers: [registry] });
const queueLenGauge = new client.Gauge({ name: "privora_queue_length", help: "in-memory queue length", registers: [registry] });

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const code = res.statusCode;
    httpRequestsTotal.inc({ route: req.path, method: req.method, code: String(code) });
    if (code === 401) auth401.inc();
    if (code === 403) forbid403.inc();
    if (code === 429) throttle429.inc();
    end();
  });
  next();
});

app.get("/metrics", metricsGuard(), async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

// ============================================================================
// 7) HMAC + Timestamp Middleware (dinamik key, canonical, raw-body)
// ============================================================================
function parseTs(v?: string): number | null {
  if (!v) return null;
  if (/^\d{10,13}$/.test(v)) return Number(v.length === 13 ? Number(v) : Number(v) * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}
function requireFreshTs(windowSec = 300, maxSkewSec = 120) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const tsHeader = String(req.header("x-ts") || "");
    const t = parseTs(tsHeader);
    if (t == null) return res.status(400).json({ ok: false, error: "bad-ts" });
    const now = Date.now();
    const skew = Math.abs(now - t) / 1000;
    if (skew > (windowSec + maxSkewSec)) return res.status(401).json({ ok: false, error: "ts-expired" });
    (req as any)._tsMillis = t;
    next();
  };
}
function isHex(str: string) { return /^[0-9a-f]+$/i.test(str) && str.length % 2 === 0; }
function tEqHex(aHex: string, bHex: string) {
  if (!isHex(aHex) || !isHex(bHex)) return false;
  const a = Buffer.from(aHex, "hex"); const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
function requireHmacDynamic() {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const keyId = (req.header("x-key-id") || "default").trim();
      const sig = String(req.header("x-signature-256") || "").trim();
      const nonce = String(req.header("x-nonce") || "").trim();
      const tsHdr = String(req.header("x-ts") || "").trim();
      if (!sig || !nonce || !tsHdr) return res.status(401).json({ ok: false, error: "missing-auth-headers" });

      const secret = await getHmacSecret(keyId);
      if (!secret) return res.status(401).json({ ok: false, error: "unknown-key" });

      const raw = (req as any)._raw ?? Buffer.from(JSON.stringify(req.body ?? ""));
      const bodyHash = createHash("sha256").update(raw).digest("hex");
      const pathname = (req.originalUrl || req.url || req.path || "").split("?")[0];
      const canon = [req.method.toUpperCase(), pathname, bodyHash, tsHdr, nonce].join("\n");
      const expect = createHmac("sha256", secret).update(canon).digest("hex");
      if (!tEqHex(expect, sig)) return res.status(401).json({ ok: false, error: "bad-signature" });

      const ttl = Number(env.NONCE_TTL_SEC);
      const ok = await nonceCheckAndSet(`privora:nonce:${keyId}:${req.ip}:${nonce}`, ttl);
      if (!ok) return res.status(401).json({ ok: false, error: "replay" });

      next();
    } catch {
      return res.status(401).json({ ok: false, error: "auth-failed" });
    }
  };
}

// ============================================================================
// 8) PER-KEY RATE LIMIT (Redis tabanlı, fallback in-mem)
// ============================================================================
function perKeyRateLimit(opts: { limit: number; windowSec: number; name: string }) {
  const mem = new Map<string, { n: number; exp: number }>();
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const id = (req.header("x-key-id") || req.ip || "anon").toString();
    const key = `privora:rl:${opts.name}:${id}`;
    const now = Date.now();
    if (redis) {
      const pipe = redis.multi();
      pipe.incr(key);
      pipe.expire(key, opts.windowSec, "NX");
      const [count] = (await pipe.exec()) as any[];
      const c = Number(count[1]);
      if (c > opts.limit) return res.status(429).json({ ok: false, error: "rate-limit" });
      return next();
    } else {
      const hit = mem.get(key);
      if (!hit || hit.exp < now) mem.set(key, { n: 1, exp: now + opts.windowSec * 1000 });
      else {
        hit.n++;
        if (hit.n > opts.limit) return res.status(429).json({ ok: false, error: "rate-limit" });
      }
      return next();
    }
  };
}

// ============================================================================
// 9) STATE / QUEUES
// ============================================================================
const store = new ProofStore(DATA_DIR);

type Job = { id: string; payload: any; createdAt: number };
const queue: Job[] = [];
function depthOf(x: any, depth = 0): number {
  if (x === null || typeof x !== "object") return depth;
  if (depth > MAX_DEPTH) return depth;
  if (Array.isArray(x)) return x.reduce((m, v) => Math.max(m, depthOf(v, depth + 1)), depth);
  return Object.values(x).reduce((m, v) => Math.max(m, depthOf(v, depth + 1)), depth + 1);
}
function pushJob(payload: any): Job { const job: Job = { id: randomUUID(), payload, createdAt: Date.now() }; queue.push(job); return job; }
function popJob(): Job | undefined { return queue.shift(); }
setInterval(() => queueLenGauge.set(queue.length), 2000).unref();
leaderGauge.set(1); // bu node'u leader varsayıyoruz; gerçek leader election varsa burayı güncelleyin

// ============================================================================
// 10) ROUTES
// ============================================================================
app.use(healthRoutes);
app.use(verifyRoutes());
app.use(historyRoutes());
app.use(correctionsRoutes(store));
app.use(disputesRoutes(store));
app.use(captureRoutes(store));
app.use("/api", fheRoutes());

// Zod şemaları
const SubmitSchema = z.object({ payload: z.any() }).strict();
const ProofSchema = z.object({
  jobId: z.string().min(1),
  proofHash: z.string().min(4),
  manifestHash: z.string().optional(),
}).strict();

// /submit
app.post(
  "/submit",
  perKeyRateLimit({ limit: 60, windowSec: 10, name: "submit" }),
  (req, res) => {
    const parsed = SubmitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: "bad-schema", details: parsed.error.issues });

    const raw = parsed.data.payload;
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

// /next-job (tazelik + HMAC)
app.post(
  "/next-job",
  requireFreshTs(),
  requireHmacDynamic(),
  perKeyRateLimit({ limit: 90, windowSec: 10, name: "next-job" }),
  (_req, res) => {
    const job = popJob();
    if (!job) return res.json({ ok: true, job: null });
    return res.json({ ok: true, job: { id: job.id, payload: job.payload } });
  }
);

// /proof (tazelik + HMAC)
app.post(
  "/proof",
  requireFreshTs(),
  requireHmacDynamic(),
  perKeyRateLimit({ limit: 120, windowSec: 10, name: "proof" }),
  async (req, res) => {
    const parsed = ProofSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ ok: false, error: "bad-schema", details: parsed.error.issues });
    const { jobId, proofHash, manifestHash } = parsed.data;

    const line: ProofLine = {
      jobId: String(jobId),
      proofHash: String(proofHash),
      manifestHash: manifestHash ? String(manifestHash) : undefined,
      createdAt: Date.now(),
      // isteğe bağlı sahalar: algId/hashId/keyVer eklemeyi düşünün
    };

    try {
      await store.append(line);
      return res.json({ ok: true, stored: true });
    } catch (e) {
      appendErrors.inc();
      return res.status(500).json({ ok: false, error: "append-failed" });
    }
  }
);

// /proofs
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

// /proofs/verify
app.get("/proofs/verify", (req, res) => {
  try {
    const leaf = String(req.query.leaf || "");
    const root = String(req.query.root || "");
    const branch = JSON.parse(String(req.query.branch || "[]"));
    const ok = verifyMerkleProof(leaf as `0x${string}`, branch, root as `0x${string}`);
    return res.json({ ok, verified: ok });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "bad-params" });
  }
});

// ============================================================================
// 11) GLOBAL ERROR HANDLER
// ============================================================================
app.use((err: any, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ ok: false, error: "internal" });
});

// ============================================================================
// 12) TIMEOUTS & START
// ============================================================================
const server = http.createServer(app);
server.headersTimeout = Number(env.HEADERS_TIMEOUT_MS);
server.requestTimeout = Number(env.REQUEST_TIMEOUT_MS);
server.keepAliveTimeout = Number(env.KEEPALIVE_TIMEOUT_MS);

server.listen(PORT, () => logger.info({ port: PORT }, "[api] listening"));
