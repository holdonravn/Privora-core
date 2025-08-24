// SPDX-License-Identifier: Apache-2.0
// api/src/mw/rateLimit.ts
import type { Request, Response, NextFunction } from "express";
import { createClient, RedisClientType } from "redis";

let _redis: RedisClientType | null = null;
async function redis() {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  _redis = createClient({ url });
  await _redis.connect();
  return _redis;
}

/** Token-bucket (Redis) — key: x-api-key + ip */
export function rateLimit(opts: { bucketSize: number; refillPerSec: number }) {
  const { bucketSize, refillPerSec } = opts;
  return async (req: Request, res: Response, next: NextFunction) => {
    const r = await redis();
    const apiKey = req.header("x-api-key") || "anon";
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const id = `rl:${apiKey}:${ip}`;

    const nowMs = Date.now();
    const st = await r.hGetAll(id);
    const last = Number(st.last || nowMs);
    const tokens = Number(st.tokens ?? bucketSize);

    const elapsedSec = Math.max(0, (nowMs - last) / 1000);
    const newTokens = Math.min(bucketSize, tokens + elapsedSec * refillPerSec);

    if (newTokens < 1) {
      await r.hSet(id, { tokens: newTokens.toString(), last: nowMs.toString() });
      await r.expire(id, 3600);
      res.setHeader("Retry-After", "1");
      return res.status(429).json({ ok: false, error: "rate-limited" });
    }
    await r.hSet(id, { tokens: (newTokens - 1).toString(), last: nowMs.toString() });
    await r.expire(id, 3600);
    return next();
  };
}
