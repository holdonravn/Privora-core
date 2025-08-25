// SPDX-License-Identifier: Apache-2.0
// load/k6/submit-proof.js
import http from "k6/http";
import { check, sleep } from "k6";

export let options = {
  stages: [
    { duration: "1m", target: 100 },
    { duration: "2m", target: 300 },
    { duration: "2m", target: 800 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed:  ["rate<0.01"],
    http_req_duration:["p(95)<300"],
  },
};

export default function () {
  const api = __ENV.API || "http://localhost:4000";
  const payload = JSON.stringify({ payload: { hello: "privora", t: Date.now() } });
  const res = http.post(`${api}/submit`, payload, { headers: { "content-type": "application/json" } });
  check(res, { "200/ok": (r) => r.status === 200 });
  sleep(0.2);
}
