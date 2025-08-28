// SPDX-License-Identifier: Apache-2.0
// api/src/mw/ipAllowlist.ts
import type { Request, Response, NextFunction } from "express";

/** Comma-separated IPv4/IPv6 list in env (e.g. "1.2.3.4, 10.0.0.0/8" is NOT supported, only exact IPs). */
export function ipAllowlistEnv(envKey: string) {
  const allow = (process.env[envKey] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (req: Request, res: Response, next: NextFunction) => {
    if (allow.length === 0) return next();
    const ip = (req.ips && req.ips.length ? req.ips[0] : req.ip) || "";
    if (allow.includes(ip)) return next();
    return res.status(403).json({ ok: false, error: "forbidden" });
  };
}
