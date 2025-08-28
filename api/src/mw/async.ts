// SPDX-License-Identifier: Apache-2.0
// api/src/mw/async.ts
import type { RequestHandler } from "express";

/**
 * asyncH - Express route'larında try/catch ihtiyacını kaldıran küçük helper.
 * Asenkron fonksiyonlardaki hataları otomatik next() ile yakalar.
 */
export const asyncH = (fn: any): RequestHandler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
