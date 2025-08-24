// SPDX-License-Identifier: Apache-2.0
// api/src/routes/corrections.ts
import { Router } from "express";
import { requireFreshTs } from "../mw/requireFreshTs.js";
import { requireHmac } from "../mw/requireHmac.js";
import type { ProofStore } from "../store/proof-store.js";
import crypto from "node:crypto";

/**
 * Minimal correction (supersede):
 * - Orijinal proof değişmez; “px” olayı ile üstüne yeni proof bağlanır.
 */
export default function correctionsRoutes(store: ProofStore) {
  const r = Router();

  // POST /proofs/:proofId/corrections
  r.post("/proofs/:proofId/corrections", requireFreshTs(), requireHmac(), async (req, res) => {
    const proofId = String(req.params.proofId || "");
    const { newProofHash, reason } = req.body ?? {};
    if (!proofId || !newProofHash) return res.status(400).json({ ok: false, error: "proofId & newProofHash required" });

    const correctionId = "c_" + crypto.randomBytes(8).toString("hex");
    const line = {
      t: "px",
      correctionId,
      supersedes: proofId,
      newProofHash: String(newProofHash),
      reason: reason ? String(reason) : undefined,
      createdAt: Date.now(),
    };
    // @ts-ignore
    await (store as any).appendAny(line);
    return res.json({ ok: true, correctionId });
  });

  return r;
}
