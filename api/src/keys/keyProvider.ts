// SPDX-License-Identifier: Apache-2.0
// api/src/keys/keyProvider.ts
import { createClient, Redis } from "ioredis";

type KeyRecord = { id: string; secret: string; ver?: string; rotatedAt?: number };
export class KeyProvider {
  private cache = new Map<string, { secret: string; exp: number }>();
  private ttlMs: number;
  constructor(private redis: Redis | null, { ttlMs = 30_000 } = {}) { this.ttlMs = ttlMs; }

  static fromEnv(redisUrl?: string) {
    if (!redisUrl) return new KeyProvider(null);
    const r = new createClient({ url: redisUrl });
    r.connect().catch(()=>{});
    return new KeyProvider(r);
  }

  async get(keyId: string): Promise<string | null> {
    const now = Date.now();
    const hit = this.cache.get(keyId);
    if (hit && hit.exp > now) return hit.secret;

    // 1) Redis (dinamik)
    if (this.redis) {
      const raw = await this.redis.get(`privora:hmac:${keyId}`);
      if (raw) {
        const rec: KeyRecord = JSON.parse(raw);
        this.cache.set(keyId, { secret: rec.secret, exp: now + this.ttlMs });
        return rec.secret;
      }
    }
    // 2) Env fallback (HMAC_KEYS = id=secret,id2=secret2)
    const csv = process.env.HMAC_KEYS || "";
    const map = new Map<string,string>();
    for (const p of csv.split(",").map(s=>s.trim()).filter(Boolean)) {
      const [id, sec] = p.split("="); if (id && sec) map.set(id, sec);
    }
    const shared = process.env.API_SHARED_SECRET || "";
    if (shared && !map.has("default")) map.set("default", shared);

    const sec = map.get(keyId) || null;
    if (sec) this.cache.set(keyId, { secret: sec, exp: now + this.ttlMs });
    return sec;
  }
}
