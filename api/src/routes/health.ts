// SPDX-License-Identifier: Apache-2.0
// api/src/routes/health.ts
import { Router } from "express";
import { lastRootAt, lastRootHex } from "../cron/daily-root";

const r = Router();

r.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

r.get("/ready", (_req, res) => {
  res.json({ ok: true });
});

r.get("/cron-status", (_req, res) => {
  res.json({
    lastRootAt,
    lastRootHex,
    tz: process.env.TZ || "UTC",
    schedule: process.env.ROOT_SCHEDULE || "5 0 * * *",
  });
});

export default r;
