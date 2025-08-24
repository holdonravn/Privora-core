// SPDX-License-Identifier: Apache-2.0
// api/src/mw/requireFreshTs.ts
import type { Request, Response, NextFunction } from "express";

const DEFAULT_WINDOW_SEC = Number(process.env.HMAC_WINDOW_SEC || 300);
const MAX_SKEW_SEC = Number(process.env.HMAC_MAX_SKEW_SEC || 10);

export function requireFreshTs() {
  return (req: Request, res: Response, next: NextFunction) => {
    const tsHdr = req.header("x-ts");
    if (!tsHdr) return res.status(401).json({ ok: false, error: "missing-ts" });
    const ts = Number(tsHdr);
    if (!Number.isFinite(ts)) return res.status(401).json({ ok: false, error: "invalid-ts" });
    const now = Math.floor(Date.now() / 1000);
    const delta = Math.abs(now - ts);
    if (delta > (DEFAULT_WINDOW_SEC + MAX_SKEW_SEC)) {
      return res.status(401).json({ ok: false, error: "stale-ts", delta });
    }
    return next();
  };
}
