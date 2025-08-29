// SPDX-License-Identifier: Apache-2.0
// api/src/cron/daily-anchor.ts
import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import type { ProofStore } from "../store/proof-store.js";

let redis: any = null;
export function setAnchorRedis(r: any) { redis = r; }

const ANCHOR_DIR = process.env.ANCHOR_DIR || ".anchors";
const ANCHOR_SCHEDULE = process.env.ANCHOR_SCHEDULE || "5 0 * * *"; // UTC 00:05

export function scheduleDailyAnchor(store: ProofStore) {
  fs.mkdirSync(ANCHOR_DIR, { recursive: true });
  cron.schedule(ANCHOR_SCHEDULE, async () => {
    try {
      const snap = store.currentRoot();
      const day = snap?.day || new Date().toISOString().slice(0,10);
      const out = {
        day,
        merkleRoot: snap?.merkleRoot ?? null,
        leafCount: snap?.leafCount ?? 0,
        file: snap?.file ?? null,
        createdAt: Date.now()
      };
      const fp = path.join(ANCHOR_DIR, `${day}.root.json`);
      await fs.promises.writeFile(fp, JSON.stringify(out, null, 2));
    } catch (e) {
      // DLQ: Redis varsa kuyruğa at
      if (redis) {
        await redis.rpush("privora:anchor:dlq", JSON.stringify({ ts: Date.now(), err: String(e) }));
      }
    }
  }, { timezone: "UTC" });
}
