// SPDX-License-Identifier: Apache-2.0
// api/src/mw/requireHmac.ts
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { checkAndSetNonce } from "../util/nonceStore.js";

const HEX_RE = /^[0-9a-f]+$/i;

function hmac256(key: string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}
function timingSafeEqHex(hexA: string, hexB: string) {
  if (!HEX_RE.test(hexA) || !HEX_RE.test(hexB) || (hexA.length !== hexB.length)) return false;
  return crypto.timingSafeEqual(Buffer.from(hexA, "hex"), Buffer.from(hexB, "hex"));
}

export function requireHmac() {
  const shared = process.env.API_SHARED_SECRET || "";
  const keysCsv = process.env.HMAC_KEYS || ""; // "keyId=secret,keyId2=secret2"
  const keyMap = new Map<string, string>();
  if (shared) keyMap.set("default", shared);
  for (const p of keysCsv.split(",").map(s => s.trim()).filter(Boolean)) {
    const [id, sec] = p.split("=");
    if (id && sec) keyMap.set(id, sec);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keyId = (req.header("x-key-id") || "default").trim();
      const provided = String(req.header("x-signature-256") || "");
      const nonce = String(req.header("x-nonce") || "");
      if (!provided || !nonce) return res.status(401).json({ ok: false, error: "missing-sig-or-nonce" });

      const secret = keyMap.get(keyId);
      if (!secret) return res.status(401).json({ ok: false, error: "unknown-key" });

      // raw body tercih; yoksa JSON serialize fallback
      const raw: Buffer =
        (req as any)._raw instanceof Buffer
          ? (req as any)._raw
          : Buffer.from(JSON.stringify(req.body ?? ""));
      const bodyHash = crypto.createHash("sha256").update(raw).digest("hex");

      const pathname = (req.originalUrl || req.url || req.path || "").split("?")[0];
      const canon = [
        req.method.toUpperCase(),
        pathname,
        bodyHash,
        String((req as any)._tsMillis || ""),
        nonce,
      ].join("\n");

      const expect = hmac256(secret, canon);
      if (!timingSafeEqHex(expect, provided)) return res.status(401).json({ ok: false, error: "bad-signature" });

      const ok = await checkAndSetNonce(`${keyId}:${nonce}`, Number(process.env.NONCE_TTL_SEC || 600));
      if (!ok) return res.status(401).json({ ok: false, error: "replay" });

      next();
    } catch {
      return res.status(401).json({ ok: false, error: "auth-failed" });
    }
  };
}
