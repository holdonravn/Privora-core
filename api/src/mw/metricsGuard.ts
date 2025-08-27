// SPDX-License-Identifier: Apache-2.0
// api/src/mw/metricsGuard.ts
import type { Request, Response, NextFunction } from "express";

export function metricsGuard() {
  const allow = (process.env.METRICS_ALLOWLIST || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const basic = process.env.METRICS_BASIC_AUTH; // "user:pass"
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = (req as any).ips?.[0] || req.ip;
    if (allow.length && !allow.includes(clientIp)) return res.status(403).end();
    if (basic) {
      const hdr = req.headers.authorization || "";
      if (!hdr.startsWith("Basic ")) { res.set("WWW-Authenticate", "Basic"); return res.status(401).end(); }
      const [u,p] = Buffer.from(hdr.slice(6), "base64").toString().split(":");
      const [eu,ep] = basic.split(":");
      if (u!==eu || p!==ep) return res.status(401).end();
    }
    next();
  };
}
