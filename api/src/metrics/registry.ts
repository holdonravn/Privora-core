// SPDX-License-Identifier: Apache-2.0
// api/src/metrics/registry.ts
import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const labels = { instance_id: process.env.INSTANCE_ID || "dev" };

// Genel amaçlı HTTP metrikleri (örn. server.ts kullanıyor olabilir)
export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Request duration histogram",
  buckets: [0.01, 0.05, 0.1, 0.3, 0.6, 1, 2, 5],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: "privora_requests_total",
  help: "Total HTTP requests",
  labelNames: ["route", "method", "code"],
  registers: [registry],
});
