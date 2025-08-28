// SPDX-License-Identifier: Apache-2.0
// api/src/cron/anchor-root.ts
import cron from "node-cron";
import { anchorRoot } from "../anchor/anchor.js";
import { ProofStore } from "../store/proof-store.js";

export function scheduleAnchorRoot(store: ProofStore) {
  const spec = process.env.ANCHOR_CRON || "10 0 * * *"; // default: 00:10 UTC
  if (!process.env.ANCHOR_ENABLE || process.env.ANCHOR_ENABLE === "false") return;
  cron.schedule(spec, async () => {
    try {
      const snap = store.currentRoot();
      await anchorRoot({
        day: snap?.day ?? new Date().toISOString().slice(0, 10),
        merkleRoot: snap?.merkleRoot ?? null,
        leafCount: snap?.leafCount ?? 0,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[anchor-cron] error", e);
    }
  });
}
