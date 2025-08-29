// File: api/src/mw/rateLimitPerKey.ts
// Redis tabanlı, API anahtarı bazlı dinamik rate limit
// ============================================================================
import type { Request, Response, NextFunction } from "express";
import IORedis, { type Redis } from "ioredis";

export function rateLimitPerKey(opts?: { windowSec?: number; maxReq?: number }) {
  const windowSec = opts?.windowSec ?? 10;
  const defaultMax = opts?.maxReq ?? 50;

  let redis: Redis | null = null;
  if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!redis) return next(); // Redis yoksa dev/localhost: geç

    const keyId = (req.header("x-key-id") || "default").trim();
    const confKey = `privora:rlmax:${keyId}`; // opsiyonel override
    const limit = Number(await redis.get(confKey)) || defaultMax;

    const bucket = `privora:rl:${keyId}:${Math.floor(Date.now()/1000/windowSec)}`;
    const n = await redis.incr(bucket);
    if (n === 1) await redis.expire(bucket, windowSec);
    if (n > limit) {
      return res.status(429).json({ ok:false, error:"rate-limited", meta:{ keyId, windowSec, limit } });
    }
    next();
  };
}
