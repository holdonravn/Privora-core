// SPDX-License-Identifier: Apache-2.0
// api/src/routes/disputes.ts
import { Router } from "express";
import { requireFreshTs } from "../mw/requireFreshTs.js";
import { requireHmac } from "../mw/requireHmac.js";
import type { ProofStore } from "../store/proof-store.js";
import crypto from "node:crypto";

/**
 * Minimal dispute akışı:
 * - do: dispute open, du: dispute update
 */
export default function disputesRoutes(store: ProofStore) {
  const r = Router();

  // POST /disputes
  r.post("/disputes", requireFreshTs(), requireHmac(), async (req, res) => {
    const { proofId, issue, evidenceCid } = req.body ?? {};
    if (!proofId || !issue) return res.status(400).json({ ok: false, error: "proofId & issue required" });

    const disputeId = "d_" + crypto.randomBytes(8).toString("hex");
    const line = {
      t: "do",
      disputeId,
      proofId: String(proofId),
      issue: String(issue),
      evidenceCid: evidenceCid ? String(evidenceCid) : undefined,
      openedAt: Date.now(),
    };
    // @ts-ignore
    await (store as any).appendAny(line);
    return res.json({ ok: true, disputeId });
  });

  // PATCH /disputes/:disputeId
  r.patch("/disputes/:disputeId", requireFreshTs(), requireHmac(), async (req, res) => {
    const disputeId = String(req.params.disputeId || "");
    const { status, note } = req.body ?? {};
    if (!disputeId || !status) return res.status(400).json({ ok: false, error: "disputeId & status required" });
    if (!["accepted", "rejected", "needs-more-info"].includes(String(status))) {
      return res.status(400).json({ ok: false, error: "invalid status" });
    }
    const line = {
      t: "du",
      disputeId,
      status: String(status),
      note: note ? String(note) : undefined,
      updatedAt: Date.now(),
    };
    // @ts-ignore
    await (store as any).appendAny(line);
    return res.json({ ok: true });
  });

  return r;
}
