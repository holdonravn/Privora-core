// SPDX-License-Identifier: Apache-2.0
// api/src/util/nonceStore.ts
import crypto from "node:crypto";
import type { Redis } from "ioredis";

let redis: Redis | null = null;
async function lazyRedis() {
  if (!redis && process.env.REDIS_URL) {
    const { default: IORedis } = await import("ioredis");
    redis = new IORedis(process.env.REDIS_URL!);
  }
  return redis;
}

// Memory fallback (LRU-ish cap)
const MEM_MAX = Number(process.env.NONCE_MEM_MAX || 50000);
const mem = new Map<string, number>();

export async function checkAndSetNonce(nonce: string, ttlSec = 600): Promise<boolean> {
  const key = "privora:nonce:" + crypto.createHash("sha256").update(nonce).digest("hex");
  const now = Date.now();
  const r = await lazyRedis();
  if (r) {
    const ok = await r.set(key, String(now), "NX", "EX", ttlSec);
    return ok === "OK"; // ilk kullanım OK, varsa null (replay)
  }
  if (mem.has(key) && (mem.get(key)! > now)) return false;
  if (mem.size >= MEM_MAX) {
    const first = mem.keys().next().value as string | undefined;
    if (first) mem.delete(first);
  }
  mem.set(key, now + ttlSec * 1000);
  setTimeout(() => mem.delete(key), ttlSec * 1000).unref();
  return true;
} 
