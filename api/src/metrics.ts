// SPDX-License-Identifier: Apache-2.0
// api/src/metrics.ts
import client from "prom-client";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Request duration histogram",
  buckets: [0.01, 0.05, 0.1, 0.3, 0.6, 1, 2, 5],
  registers: [registry],
});

export const reqCounter = new client.Counter({
  name: "privora_requests_total",
  help: "Total HTTP requests",
  labelNames: ["route", "method", "code"],
  registers: [registry],
});

export const hmacFailCounter = new client.Counter({
  name: "privora_hmac_fail_total",
  help: "HMAC auth failures",
  labelNames: ["reason"],
  registers: [registry],
});

export const nonceRejectCounter = new client.Counter({
  name: "privora_nonce_reject_total",
  help: "Nonce replay rejects",
  registers: [registry],
});

export const fheIngestCounter = new client.Counter({
  name: "privora_fhe_ingest_total",
  help: "FHE ingest accepted",
  registers: [registry],
});

export const anchorOk = new client.Counter({
  name: "privora_anchor_ok_total",
  help: "Anchor success",
  registers: [registry],
});

export const anchorFail = new client.Counter({
  name: "privora_anchor_fail_total",
  help: "Anchor failures",
  registers: [registry],
});

export { registry };
