// SPDX-License-Identifier: Apache-2.0
// api/src/util/kmsKeyProvider.ts
import { createClient, type Redis } from "ioredis";

/**
 * Hedef: HMAC anahtarlarını dinamik ve güvenli sağlamak.
 * Öncelik sırası:
 *   1) Redis key:  privora:hmac:<keyId>  (production)
 *   2) ENV HMAC_KEYS "id=secret,id2=secret2"  veya API_SHARED_SECRET -> "default"
 *
 * Notlar:
 * - KMS/Secrets Manager entegrasyonu için bu dosyada "hook" bırakıldı:
 *   fetchFromKMS(keyId) fonksiyonunu kendi ortamına göre doldurabilirsin.
 * - In-memory cache (TTL) ile Redis yükü azaltılır.
 */

type KeyRecord = { secret: string; loadedAt: number };
const CACHE_TTL_MS = Number(process.env.KEY_CACHE_TTL_MS || 60_000); // 60 sn
const cache = new Map<string, KeyRecord>();

let redis: Redis | null = null;
async function lazyRedis(): Promise<Redis | null> {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const r = new createClient({ url });
  r.on("error", () => {}); // üst katman logluyor
  try { await r.connect(); redis = r; } catch { return null; }
  return redis;
}

// ENV -> Map
function parseEnvKeys(): Map<string, string> {
  const map = new Map<string, string>();
  const shared = process.env.API_SHARED_SECRET || "";
  const csv = process.env.HMAC_KEYS || ""; // "id=secret,id2=secret2"
  if (shared) map.set("default", shared);
  for (const p of csv.split(",").map(s => s.trim()).filter(Boolean)) {
    const [id, sec] = p.split("=");
    if (id && sec) map.set(id, sec);
  }
  return map;
}

// KMS/Secrets Manager HOOK (opsiyonel) — burada gerçek entegrasyonu yap
async function fetchFromKMS(_keyId: string): Promise<string | null> {
  // Örn: AWS/GCP/Azure SDK ile getSecretValue(...)
  // Bu örnekte pasif bırakıyoruz:
  return null;
}

function now() { return Date.now(); }
function fresh(rec?: KeyRecord | undefined) {
  return !!rec && (now() - rec.loadedAt) < CACHE_TTL_MS;
}

/**
 * Anahtar getirir. Bulunamazsa null döner.
 * - Prod’da REQUIRE_REDIS_KEYS=true ise ENV fallback devre dışı kalır.
 */
export async function loadKeyFromKMS(keyId: string): Promise<string | null> {
  // 1) Cache
  const c = cache.get(keyId);
  if (fresh(c)) return c!.secret;

  const requireRedis = (process.env.REQUIRE_REDIS_KEYS || "").toLowerCase() === "true";

  // 2) Redis
  const r = await lazyRedis();
  if (r) {
    const redisKey = `privora:hmac:${keyId}`;
    const v = await r.get(redisKey);
    if (v && v.length > 0) {
      cache.set(keyId, { secret: v, loadedAt: now() });
      return v;
    }
  }

  // 3) KMS/Secrets Manager (opsiyonel)
  const kmsSecret = await fetchFromKMS(keyId);
  if (kmsSecret) {
    cache.set(keyId, { secret: kmsSecret, loadedAt: now() });
    return kmsSecret;
  }

  // 4) ENV fallback (opsiyonel)
  if (!requireRedis) {
    const envMap = parseEnvKeys();
    const envSecret = envMap.get(keyId) || (keyId === "default" ? envMap.get("default") : undefined);
    if (envSecret) {
      cache.set(keyId, { secret: envSecret, loadedAt: now() });
      return envSecret;
    }
  }

  return null;
}

/**
 * Manuel invalidate — rotasyon sonrası kullanışlı.
 */
export function invalidateKeyCache(keyId?: string) {
  if (!keyId) cache.clear();
  else cache.delete(keyId);
}

/**
 * Test/ops için: Redis’e anahtar yaz (örn. rotasyon hazırlığı).
 * UYARI: Prod’da gerçek rotasyon pipeline’ı kullanın.
 */
export async function putKeyToRedis(keyId: string, secret: string, ttlSec?: number) {
  const r = await lazyRedis();
  if (!r) throw new Error("Redis not available");
  const k = `privora:hmac:${keyId}`;
  if (ttlSec && Number.isFinite(ttlSec)) {
    await r.set(k, secret, "EX", Math.floor(ttlSec));
  } else {
    await r.set(k, secret);
  }
  cache.set(keyId, { secret, loadedAt: now() });
}
