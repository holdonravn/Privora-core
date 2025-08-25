// SPDX-License-Identifier: Apache-2.0
// api/src/mw/cacheControl.ts
import type { Request, Response, NextFunction } from "express";

/**
 * Sets Cache-Control headers for public endpoints (e.g., /verify/status).
 * Example: public, max-age=60, stale-while-revalidate=300
 */
export function cacheControl(opts: { ttlSec: number; swrSec?: number }) {
  const { ttlSec, swrSec = 0 } = opts;
  const value =
    "public, max-age=" +
    Math.max(0, ttlSec) +
    (swrSec > 0 ? `, stale-while-revalidate=${Math.max(0, swrSec)}` : "");
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", value);
    next();
  };
}
