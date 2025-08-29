// SPDX-License-Identifier: Apache-2.0
// api/src/cron/anchor-retry.ts
import cron from "node-cron";

export function scheduleAnchorRetry(redis: any) {
  if (!redis) return;
  cron.schedule("*/5 * * * *", async () => {
    try {
      const item = await redis.lpop("privora:anchor:dlq");
      if (!item) return;
      // Şimdilik sadece logla; ileride zincire yazma/harici servis çağrısı eklenebilir
      console.warn("[anchor-dlq] retry placeholder", item);
    } catch {
      // ignore
    }
  });
}
