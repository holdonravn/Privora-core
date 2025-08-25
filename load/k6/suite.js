// SPDX-License-Identifier: Apache-2.0
// load/k6/suite.js  (karma: submit & verify)
import http from "k6/http";
import { check, sleep } from "k6";

export let options = {
  scenarios: {
    submit: {
      executor: "ramping-vus",
      exec: "submit",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 200 },
        { duration: "2m", target: 600 },
        { duration: "2m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
    verify: {
      executor: "constant-vus",
      exec: "verify",
      vus: 200,
      duration: "5m",
      startTime: "30s",
      gracefulStop: "30s",
    },
  },
  thresholds: {
    "http_req_failed{scenario:submit}": ["rate<0.01"],
    "http_req_duration{scenario:submit}": ["p(95)<350"],
    "http_req_failed{scenario:verify}": ["rate<0.01"],
    "http_req_duration{scenario:verify}": ["p(95)<150"],
  },
};

export function submit() {
  const api = __ENV.API || "http://localhost:4000";
  const payload = JSON.stringify({ payload: { hello: "privora", t: Date.now() } });
  const res = http.post(`${api}/submit`, payload, { headers: { "content-type": "application/json" } });
  check(res, { "200/ok": (r) => r.status === 200 });
  sleep(0.15);
}

function randomId() { return Math.random().toString(16).slice(2); }

export function verify() {
  const api = __ENV.API || "http://localhost:4000";
  const contentId = Math.random() < 0.5 ? `cid_known_${(Date.now()/1000|0) % 5}` : `cid_unknown_${randomId()}`;
  const res = http.get(`${api}/verify/status?contentId=${contentId}`);
  check(res, { "200/ok": (r) => r.status === 200 });
  sleep(0.1);
}
