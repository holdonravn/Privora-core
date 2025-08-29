// SPDX-License-Identifier: Apache-2.0
// api/src/mw/requireHmac.ts
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { checkAndSetNonce } from "../util/nonceStore.js";
import { loadKeyFromKMS } from "../util/kmsKeyProvider.js";

/**
 * Helper: compute HMAC-SHA256 in hex
 */
function hmac256(key: string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

/**
 * Helper: timing-safe comparison of two hex strings
 */
function timingSafeEqHex(aHex: string, bHex: string) {
  if (!/^[0-9a-f]+$/i.test(aHex) || !/^[0-9a-f]+$/i.test(bHex)) return false;
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Canonical String Format (shared by Zero1 and Privora):
 * ```
 * METHOD\nPATH\nSHA256(rawBody)\nx-ts\nx-nonce
 * ```
 * Required Headers:
 * - x-signature-256
 * - x-nonce
 * - x-ts
 * Optional:
 * - x-key-id (defaults to "default")
 */
export function requireHmac() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keyId = (req.header("x-key-id") || "default").trim();
      const providedSig = String(req.header("x-signature-256") || "").trim();
      const nonce = String(req.header("x-nonce") || "").trim();
      const ts = String(req.header("x-ts") || "").trim();

      if (!providedSig || !nonce || !ts) {
        return res.status(401).json({ ok: false, error: "missing-auth-headers" });
      }

      // Load HMAC key dynamically from Redis/KMS/ENV
      const secret = await loadKeyFromKMS(keyId);
      if (!secret) {
        return res.status(401).json({ ok: false, error: "unknown-key" });
      }

      // Use raw body captured in server.ts (req._raw)
      const raw = (req as any)._raw ?? Buffer.from(JSON.stringify(req.body ?? ""));
      const bodyHash = crypto.createHash("sha256").update(raw).digest("hex");

      const pathname = (req.originalUrl || req.url || req.path || "").split("?")[0];
      const canonical = [
        req.method.toUpperCase(),
        pathname,
        bodyHash,
        ts,
        nonce,
      ].join("\n");

      // Compute expected signature
      const expected = hmac256(secret, canonical);
      if (!timingSafeEqHex(expected, providedSig)) {
        return res.status(401).json({ ok: false, error: "invalid-signature" });
      }

      // Nonce replay protection
      const ttl = Number(process.env.NONCE_TTL_SEC || 600);
      const nonceKey = `${keyId}:${nonce}`;
      const valid = await checkAndSetNonce(nonceKey, ttl);
      if (!valid) {
        return res.status(401).json({ ok: false, error: "replay-detected" });
      }

      return next();
    } catch (err) {
      console.error("HMAC verification error:", err);
      return res.status(401).json({ ok: false, error: "auth-failed" });
    }
  };
}
