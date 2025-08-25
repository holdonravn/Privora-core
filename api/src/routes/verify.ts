// SPDX-License-Identifier: Apache-2.0
// api/src/routes/verify.ts
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { cacheControl } from "../mw/cacheControl.js";
import { FLAGS } from "../config/flags.js";

const DATA_DIR = process.env.DATA_DIR || ".data";

function* listNdjsonFiles(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.startsWith("proofs-") && f.endsWith(".ndjson"));
  files.sort();
  for (const f of files) yield path.join(dir, f);
}

/**
 * Minimal verify/status:
 * - Badge ve UI için “verified / check / unverified” döner.
 * - “check” = correction/dispute var.
 * - Public cache: max-age (TTL) + stale-while-revalidate (SWR)
 */
export default function verifyRoutes() {
  const r = Router();

  // Cache headers only for GET /verify/status
  r.get(
    "/verify/status",
    cacheControl({
      ttlSec: FLAGS.badgeCacheTtlSec,
      swrSec: FLAGS.badgeStaleWhileRevalidateSec,
    }),
    async (req, res) => {
      const contentId = req.query.contentId ? String(req.query.contentId) : undefined;
      const proofIdQ  = req.query.proofId  ? String(req.query.proofId)  : undefined;
      if (!contentId && !proofIdQ) return res.status(400).json({ ok: false, error: "contentId or proofId required" });

      let found: any = null;
      let corrected = false;
      let disputed  = false;

      for (const file of listNdjsonFiles(DATA_DIR)) {
        const txt = fs.readFileSync(file, "utf8");
        for (const raw of txt.split("\n")) {
          const line = raw.trim(); if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (!found && obj.t === "pc") {
              if ((contentId && obj.contentId === contentId) || (proofIdQ && obj.proofId === proofIdQ)) {
                found = obj;
              }
            }
            if (found && obj.t === "px" && obj.supersedes === found.proofId) corrected = true;
            if (found && obj.t === "do" && obj.proofId   === found.proofId) disputed  = true;
          } catch {}
        }
      }

      const status = found ? (corrected || disputed ? "check" : "verified") : "unverified";
      return res.json({
        ok: true,
        status,                     // "verified" | "check" | "unverified"
        corrected, disputed,
        meta: found ? {
          proofId: found.proofId,
          contentId: found.contentId,
          createdAt: found.createdAt
        } : null
      });
    }
  );

  return r;
}
