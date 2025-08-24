// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { computeRootFromNdjsonStream, todayNdjson } from "../lib/proofStream.js";
import { notifyAlert } from "../lib/alerts.js";
import { dualAnchorForDay } from "../anchor/dual.js";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "api/.data");
const ROOT_ALGO = (process.env.MERKLE_LEAF_HASH || "sha256") as "sha256" | "keccak";
const CRON_EXPR = process.env.ROOT_SCHEDULE || "5 0 * * *"; // 00:05 UTC
const TZ = process.env.TZ || "UTC";
const MAX_RETRY = parseInt(process.env.ROOT_RETRY || "2", 10);

export let lastRootAt: number | null = null;
export let lastRootHex: string | null = null;

async function doOnce(dayFile: string) {
  const outRootFile = dayFile.replace(/\.ndjson$/, ".root");
  const outMetaFile = dayFile.replace(/\.ndjson$/, ".meta.json");

  const dayStr = path.basename(dayFile).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const dayKey = dayStr.replace(/-/g, "");

  console.log(`[cron] computing daily root for ${path.basename(dayFile)}…`);
  const res = await computeRootFromNdjsonStream({
    file: dayFile,
    leafHash: ROOT_ALGO,
    progressEvery: 200_000,
  });

  fs.writeFileSync(outRootFile, (res.rootHex ?? "") + "\n", { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(
    outMetaFile,
    JSON.stringify(
      { day: dayStr, algo: res.algo, count: res.count, root: res.rootHex, at: new Date().toISOString() },
      null, 2),
    { encoding: "utf8", mode: 0o600 }
  );

  lastRootAt = Date.now();
  lastRootHex = res.rootHex ?? null;

  console.log(`[cron] root=${res.rootHex} count=${res.count}`);
  if (!res.rootHex || res.count === 0) {
    await notifyAlert("warn", `Daily root computed with anomalies (root=${res.rootHex}, count=${res.count})`);
    return;
  }

  // Dual-anchor (L2 + OTS) — env sağlanmışsa L2 tx atılır, OTS stub kaydı yazılır
  try {
    const anchor = await dualAnchorForDay(dayKey, res.rootHex!, res.count);
    console.log(`[cron] dual-anchor ok`, anchor);
  } catch (e: any) {
    console.error("[cron] dual-anchor failed:", e?.message || e);
    await notifyAlert("warn", `Dual-anchor failed: ${e?.message || e}`);
  }
}

export async function runDailyRootNow(): Promise<void> {
  const dayFile = todayNdjson(DATA_DIR);
  if (!fs.existsSync(dayFile)) {
    console.warn(`[cron] no NDJSON for today: ${dayFile}`);
    await notifyAlert("info", `No NDJSON for today (${path.basename(dayFile)}); skipping root.`);
    return;
  }
  for (let i = 0; i <= MAX_RETRY; i++) {
    try { await doOnce(dayFile); return; }
    catch (e) {
      console.error(`[cron] root compute failed (attempt ${i + 1}/${MAX_RETRY + 1})`, e);
      if (i === MAX_RETRY) await notifyAlert("error", `Daily root FAILED after retries: ${(e as Error).message}`);
      else await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

export function scheduleDailyRoot(): void {
  cron.schedule(CRON_EXPR, runDailyRootNow, { timezone: TZ });
  console.log(`[cron] scheduled ROOT job: "${CRON_EXPR}" TZ=${TZ}`);
}
