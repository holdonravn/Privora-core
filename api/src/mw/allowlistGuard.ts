// SPDX-License-Identifier: Apache-2.0
// api/src/mw/allowlistGuard.ts
import type { Request, Response, NextFunction } from "express";

/**
 * Basit IP allowlist guard.
 * - app.set('trust proxy', true) ise req.ips[0] en öndeki gerçek IP’dir.
 * - IPv6-mapped IPv4 (::ffff:1.2.3.4) normalize edilir.
 * - CIDR yok; net, sade: tam IP eşleşmesi (örn. "1.2.3.4").
 *
 */
function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return "";
  // IPv6-mapped IPv4 -> IPv4
  if (ip.startsWith("::ffff:")) return ip.substring(7);
  // IPv6 localhost -> 127.0.0.1 eşleniği
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

/**
 * allowlist: string[]  -> ["1.2.3.4","10.0.0.5", ...]
 * boşsa guard her şeyi geçirir (örn. dev ortamı).
 */
export function allowlistGuard(allowlist: string[]) {
  const set = new Set(allowlist.map(normalizeIp).filter(Boolean));

  return (req: Request, res: Response, next: NextFunction) => {
    if (set.size === 0) return next(); // allowlist boş -> serbest

    // trust proxy aktifse ilk IP gerçektir; değilse req.ip kullanılır
    const candidate = normalizeIp((req as any).ips?.[0] || req.ip);
    if (set.has(candidate)) return next();

    // X-Forwarded-For zincirinden herhangi biri listede mi?
    const chain: string[] = ((req as any).ips || []).map(normalizeIp);
    for (const ip of chain) {
      if (set.has(ip)) return next();
    }

    // Eşleşme yok
    res.status(403).json({ ok: false, error: "forbidden" });
  };
}
