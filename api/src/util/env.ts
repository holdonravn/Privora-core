// SPDX-License-Identifier: Apache-2.0
// api/src/util/env.ts
export function requireEnv() {
  const isProd = process.env.NODE_ENV === "production";
  const must = (k: string) => {
    const v = process.env[k];
    if (isProd && (!v || v.trim() === "")) throw new Error(`Missing required env: ${k}`);
    return v ?? "";
  };
  return {
    NODE_ENV: process.env.NODE_ENV || "development",
    API_KEY: must("API_KEY"),
    HMAC_KEYS_OR_SINGLE: process.env.HMAC_KEYS || process.env.API_SHARED_SECRET || "",
    REDIS_URL: must("REDIS_URL"),
    DATA_DIR: process.env.DATA_DIR || "api/.data",
  };
}
