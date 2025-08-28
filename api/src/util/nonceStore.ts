// SPDX-License-Identifier: Apache-2.0
// api/src/util/nonceStore.ts
import crypto from "node:crypto";
import type { Redis } from "ioredis";
import { nonceRejectCounter } from "../metrics.js";

let redis: Redis | null = null;
const REQUIRE_REDIS = (process.env.REQUIRE_REDIS_NONCE || "true") !== "false";

// bounded in-memory fallback (test/dev only)
const MEM_MAX = Number(process.env.NONCE_MEM_MAX || 50000);
const mem = new Map<string, number>();

async function lazyRedis() {
  if (!redis && process.env.REDIS_URL) {
    const { default: IORedis } = await import("ioredis");
    redis = new IORedis(process.env.REDIS_URL!);
  }
  return redis;
}

export async function checkAndSetNonce(nonce: string, ttlSec = 600): Promise<boolean> {
  const key = "privora:nonce:" + crypto.createHash("sha256").update(nonce).digest("hex");
  const now = Date.now();
  const r = await lazyRedis();

  if (!r && REQUIRE_REDIS && process.env.NODE_ENV !== "test") {
    // hard fail when redis required
    nonceRejectCounter.inc();
    throw new Error("nonce-store-unavailable");
  }

  if (r) {
    const ok = await r.set(key, String(now), "NX", "EX", ttlSec);
    const pass = ok === "OK";
    if (!pass) nonceRejectCounter.inc();
    return pass;
  }

  // in-memory fallback (dev/test)
  const exp = mem.get(key);
  if (exp && exp > now) {
    nonceRejectCounter.inc();
    return false;
  }
  if (mem.size >= MEM_MAX) {
    // simple LRU-ish trim: delete a few oldest
    const keys = Array.from(mem.keys()).slice(0, Math.ceil(MEM_MAX * 0.1));
    for (const k of keys) mem.delete(k);
  }
  mem.set(key, now + ttlSec * 1000);
  setTimeout(() => mem.delete(key), ttlSec * 1000).unref();
  return true;
}
