// SPDX-License-Identifier: Apache-2.0
// api/src/store/append-queue.ts
import type { Redis } from "ioredis";
import fs from "node:fs";
import path from "node:path";
import { LeaderElector } from "../util/leader.js";
import { registry, labels } from "../metrics/registry.js";
import client from "prom-client";

export type AppendItem = { eventId: string; file: string; line: string };

const dequeued = new client.Counter({
  name: "privora_append_dequeued_total",
  help: "Dequeued append items",
  registers: [registry],
});
const appendErrors = new client.Counter({
  name: "privora_append_errors_total",
  help: "Append write errors",
  registers: [registry],
});
const drainLatency = new client.Histogram({
  name: "privora_append_drain_latency_ms",
  help: "Drain loop latency (ms)",
  buckets: [1, 5, 10, 20, 50, 100, 250, 500],
  registers: [registry],
});
const leaderGauge = new client.Gauge({
  name: "leader_is_leader",
  help: "1 if this instance is leader",
  labelNames: ["instance_id"],
  registers: [registry],
});

// Basit LRU (idempotency) — son N eventId
class IdLRU {
  private max: number;
  private map = new Map<string, number>();
  constructor(max = Number(process.env.APPEND_LRU_SIZE || 50000)) { this.max = max; }
  has(id: string) { return this.map.has(id); }
  add(id: string) {
    this.map.set(id, Date.now());
    if (this.map.size > this.max) {
      // en eskiyi at
      const first = this.map.keys().next().value;
      if (first) this.map.delete(first);
    }
  }
}

export class AppendQueue {
  private elector: LeaderElector | null = null;
  private drainTimer?: NodeJS.Timeout;
  private lru = new IdLRU();

  constructor(private dir: string, private redis: Redis | null) {}

  async init() {
    if (this.redis) {
      this.elector = new LeaderElector(this.redis);
      await this.elector.start();
      this.startDrainLoop();
    }
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  async enqueue(file: string, line: string, eventId?: string) {
    const payload: AppendItem = { file, line, eventId: eventId || cryptoRandom() };
    if (this.redis) {
      await this.redis.rpush("privora:append", JSON.stringify(payload));
      return;
    }
    // fallback: lokal; idempotency kontrol
    if (!this.lru.has(payload.eventId)) {
      await fs.promises.appendFile(file, payload.line + "\n", { flag: "a" });
      this.lru.add(payload.eventId);
    }
  }

  private startDrainLoop() {
    if (!this.redis || !this.elector) return;
    const key = "privora:append";
    const loop = async () => {
      const end = drainLatency.startTimer();
      try {
        const isLeader = this.elector!.isLeader;
        leaderGauge.set({ instance_id: labels.instance_id }, isLeader ? 1 : 0);

        if (isLeader) {
          const res = await this.redis!.blpop(key, 1); // 1s blokla
          if (res && res[1]) {
            const item = JSON.parse(res[1]) as AppendItem;
            if (!this.lru.has(item.eventId)) {
              const fpath = path.resolve(item.file);
              await fs.promises.mkdir(path.dirname(fpath), { recursive: true });
              await fs.promises.appendFile(fpath, item.line + "\n", { flag: "a" });
              this.lru.add(item.eventId);
            }
            dequeued.inc();
          }
        }
      } catch {
        appendErrors.inc();
      } finally {
        end();
        this.drainTimer = setImmediate(loop) as unknown as NodeJS.Timeout;
        (this.drainTimer as any).unref?.();
      }
    };
    loop();
  }

  async close() {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    await this.elector?.stop();
  }
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
