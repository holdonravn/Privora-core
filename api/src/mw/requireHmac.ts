// x-signature-256, canonical string + KeyProvider (dinamik anahtar)
// ============================================================================
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { checkAndSetNonce } from "../util/nonceStore.js";
import { KeyProvider } from "../keys/keyProvider.js";

function hmac256(key: string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}
function isHex(str: string) { return /^[0-9a-f]+$/i.test(str) && str.length % 2 === 0; }
function timingSafeEqHex(aHex: string, bHex: string) {
  if (!isHex(aHex) || !isHex(bHex)) return false;
  const a = Buffer.from(aHex, "hex"); const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const provider = KeyProvider.fromEnv(process.env.REDIS_URL);

/**
 * Canonical:
 * METHOD \n PATH \n SHA256(rawBody) \n x-ts \n x-nonce
 * Header: x-signature-256
 */
export function requireHmac() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keyId = (req.header("x-key-id") || "default").trim();
      const provided = String(req.header("x-signature-256") || "").trim();
      const nonce = String(req.header("x-nonce") || "").trim();
      const tsHdr = String(req.header("x-ts") || "").trim();
      if (!provided || !nonce || !tsHdr) return res.status(401).json({ ok:false, error:"missing-auth-headers" });

      const secret = await provider.get(keyId);
      if (!secret) return res.status(401).json({ ok:false, error:"unknown-key" });

      const raw = (req as any)._raw ?? Buffer.from(JSON.stringify(req.body ?? ""));
      const bodyHash = crypto.createHash("sha256").update(raw).digest("hex");
      const pathname = (req.originalUrl || req.url || req.path || "").split("?")[0];
      const canon = [req.method.toUpperCase(), pathname, bodyHash, tsHdr, nonce].join("\n");

      const expect = hmac256(secret, canon);
      if (!timingSafeEqHex(expect, provided)) return res.status(401).json({ ok:false, error:"bad-signature" });

      const ttl = Number(process.env.NONCE_TTL_SEC || 600);
      const ok = await checkAndSetNonce(`${keyId}:${nonce}`, ttl);
      if (!ok) return res.status(401).json({ ok:false, error:"replay" });

      next();
    } catch {
      return res.status(401).json({ ok:false, error:"auth-failed" });
    }
  };
}
