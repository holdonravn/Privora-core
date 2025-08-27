// SPDX-License-Identifier: Apache-2.0
// api/src/routes/verify.ts

import { Router } from "express";
import { cacheControl } from "../mw/cacheControl.js";
import { FLAGS } from "../config/flags.js";
import { StatusIndex } from "../store/status-index.js";

const DATA_DIR = process.env.DATA_DIR || ".data";
const index = new StatusIndex(DATA_DIR);
await index.boot();

export default function verifyRoutes() {
  const r = Router();

  r.get(
    "/verify/status",
    cacheControl({
      ttlSec: FLAGS.badgeCacheTtlSec,
      swrSec: FLAGS.badgeStaleWhileRevalidateSec,
    }),
    (req, res) => {
      const contentId =
        typeof req.query.contentId === "string" ? req.query.contentId : undefined;
      const proofId =
        typeof req.query.proofId === "string" ? req.query.proofId : undefined;

      const out = index.get(contentId, proofId);
      return res.json({ ok: true, ...out });
    }
  );

  return r;
}
