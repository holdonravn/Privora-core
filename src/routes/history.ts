// SPDX-License-Identifier: Apache-2.0
// api/src/routes/history.ts
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || ".data";

function* listNdjsonFiles(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.startsWith("proofs-") && f.endsWith(".ndjson"));
  files.sort();
  for (const f of files) yield path.join(dir, f);
}

/**
 * Minimal history:
 * - Bir proofId için pc/px/do/du olaylarını kronolojik verir.
 */
export default function historyRoutes() {
  const r = Router();

  r.get("/proofs/:proofId/history", async (req, res) => {
    const proofId = String(req.params.proofId || "");
    if (!proofId) return res.status(400).json({ ok: false, error: "proofId required" });

    const events: any[] = [];
    for (const file of listNdjsonFiles(DATA_DIR)) {
      const txt = fs.readFileSync(file, "utf8");
      for (const raw of txt.split("\n")) {
        const line = raw.trim(); if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj?.proofId === proofId || obj?.supersedes === proofId || obj?.disputeId) {
            if (obj.t === "du" || obj.t === "do" || obj.t === "px" || (obj.t === "pc" && obj.proofId === proofId)) {
              events.push(obj);
            }
          }
        } catch {}
      }
    }

    events.sort((a, b) => {
      const ta = a.createdAt ?? a.openedAt ?? a.updatedAt ?? 0;
      const tb = b.createdAt ?? b.openedAt ?? b.updatedAt ?? 0;
      return ta - tb;
    });

    return res.json({ ok: true, events });
  });

  return r;
}
