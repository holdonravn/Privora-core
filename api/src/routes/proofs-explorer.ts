// SPDX-License-Identifier: Apache-2.0
// api/src/routes/proofs-explorer.ts

import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

export default function proofsExplorerRoutes(opts: {
  dataDir: string;         // ProofStore klasörü (NDJSON dosyaları burada)
  anchorsDir?: string;     // Günlük anchor JSON’ları (varsayılan .anchors)
  fileHint?: () => string; // ProofStore.currentFilePath() gibi aktif dosya yolu
}) {
  const r = Router();
  const ANCHOR_DIR = opts.anchorsDir || ".anchors";

  // Son N satırı JSON’a çevir (NDJSON -> JSON[])
  r.get("/proofs/chain", async (req, res) => {
    try {
      const n = Math.min(Number(req.query.n || 100), 2000);
      const fp =
        opts.fileHint?.() ||
        path.join(opts.dataDir, latestProofFile(opts.dataDir));
      const lines = await readLastLines(fp, n);
      const out = lines
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => JSON.parse(s))
        .filter((o) => o && o.proofHash); // header satırını at
      res.json({ ok: true, count: out.length, items: out });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "read-failed" });
    }
  });

  // Anchor listesi (günlük kök özetleri)
  r.get("/proofs/anchors", async (_req, res) => {
    try {
      const files = await fs.promises.readdir(ANCHOR_DIR).catch(() => []);
      const items = [];
      for (const f of files.sort().slice(-60)) {
        // Son 60 gün
        if (!f.endsWith(".root.json")) continue;
        const raw = await fs.promises
          .readFile(path.join(ANCHOR_DIR, f), "utf8")
          .catch(() => "");
        if (!raw) continue;
        try {
          items.push(JSON.parse(raw));
        } catch {}
      }
      res.json({ ok: true, count: items.length, items });
    } catch (e: any) {
      res
        .status(500)
        .json({ ok: false, error: e?.message || "anchors-read-failed" });
    }
  });

  return r;
}

function latestProofFile(dir: string) {
  // YYYY-MM-DD sıralamasıyla en son dosyayı bul
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("proofs-") && f.endsWith(".ndjson"));
  if (files.length === 0)
    return `proofs-${new Date().toISOString().slice(0, 10)}.ndjson`;
  return files.sort().at(-1)!;
}

async function readLastLines(fp: string, n: number): Promise<string[]> {
  try {
    const raw = await fs.promises.readFile(fp, "utf8");
    const lines = raw.split(/\r?\n/);
    return lines.slice(-n);
  } catch {
    return [];
  }
}
