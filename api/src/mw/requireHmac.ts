// SPDX-License-Identifier: Apache-2.0
// api/src/mw/requireHmac.ts
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

function stableStringify(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}

type KeyEntry = { id: string; key: string };
function loadKeys(): KeyEntry[] {
  const raw = process.env.HMAC_KEYS;
  if (raw) {
    try {
      const arr = JSON.parse(raw) as KeyEntry[];
      return arr.filter(x => x && typeof x.id === "string" && typeof x.key === "string");
    } catch {}
  }
  const single = process.env.API_SHARED_SECRET;
  const id = process.env.API_KEY_ID || "default";
  return single ? [{ id, key: single }] : [];
}

/** Prod: secrets yoksa throw. Dev: uyarı ve pas geç. Rotasyon: `x-key-id`. */
export function requireHmac() {
  const apiKey = process.env.API_KEY || "";
  const keys = loadKeys();
  const isProd = process.env.NODE_ENV === "production";

  if (!apiKey || keys.length === 0) {
    const msg = "[HMAC] API_KEY or HMAC key(s) missing";
    if (isProd) throw new Error(msg);
    console.warn(msg + " — DEV MODE: HMAC DISABLED");
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const hdrKey = String(req.header("x-api-key") || "");
    const ts = String(req.header("x-ts") || "");
    const nonce = String(req.header("x-nonce") || "");
    const sig = String(req.header("x-sig") || "");
    const keyId = String(req.header("x-key-id") || "");

    if (hdrKey !== apiKey) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!ts || !nonce || !sig) return res.status(401).json({ ok: false, error: "missing-hmac" });

    const active = (keys.find(k => k.id === keyId) ?? keys[keys.length - 1])?.key;
    if (!active) return res.status(401).json({ ok: false, error: "key-not-found" });

    const payload = `${stableStringify(req.body ?? {})}.${nonce}.${ts}`;
    const vsig = crypto.createHmac("sha256", active).update(payload).digest("hex");
    if (vsig !== sig) return res.status(401).json({ ok: false, error: "bad-signature" });

    return next();
  };
}
