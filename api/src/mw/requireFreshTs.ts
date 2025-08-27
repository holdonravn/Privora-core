// SPDX-License-Identifier: Apache-2.0
// api/src/mw/requireFreshTs.ts
import type { Request, Response, NextFunction } from "express";

function parseTs(v: string | undefined): number | null {
  if (!v) return null;
  if (/^\d{10,13}$/.test(v)) return Number(v.length === 13 ? Number(v) : Number(v) * 1000);
  const t = Date.parse(v); // RFC3339/ISO-8601
  return Number.isNaN(t) ? null : t;
}

export function requireFreshTs(opts?: { windowSec?: number; maxSkewSec?: number }) {
  const windowSec = opts?.windowSec ?? Number(process.env.HMAC_WINDOW_SEC || 300);
  const maxSkewSec = opts?.maxSkewSec ?? Number(process.env.HMAC_MAX_SKEW_SEC || 10);
  return (req: Request, res: Response, next: NextFunction) => {
    const tsHeader = String(req.header("x-ts") || "");
    const t = parseTs(tsHeader);
    if (t == null) return res.status(400).json({ ok: false, error: "bad-ts" });
    const now = Date.now();
    const skew = Math.abs(now - t) / 1000;
    if (skew > (windowSec + maxSkewSec)) return res.status(401).json({ ok: false, error: "ts-expired" });
    (req as any)._tsMillis = t;
    next();
  };
}
