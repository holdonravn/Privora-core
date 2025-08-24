🔐 Privora API

This is the API layer of Privora.
It provides endpoints for proof submission, verification, corrections, disputes, and audit history, secured with HMAC + Nonce + Timestamp middleware.

⸻

🚀 Quickstart

# Navigate to API folder
cd api

# Install dependencies
npm install

# Run in dev mode
npm run dev

# Run in production
npm run build && npm start

Server will start on http://localhost:4000 by default.

⸻

🔍 Endpoints
	•	POST /submit → Submit raw payload for proofing
	•	POST /next-job → Worker fetches queued jobs (HMAC + fresh timestamp required)
	•	POST /proof → Append proof (HMAC + fresh timestamp required)
	•	GET /proofs → Current Merkle root snapshot
	•	GET /proofs/verify → Verify inclusion (off-chain)
	•	GET /verify/status → Returns verified | check | unverified for badge.js
	•	POST /capture → Capture AI output / media proof line
	•	POST /proofs/:proofId/corrections → Supersede existing proof with correction
	•	POST /disputes → Open dispute for a proof
	•	PATCH /disputes/:disputeId → Update dispute status
	•	GET /proofs/:proofId/history → Full audit trail for a proof
	•	GET /metrics → Prometheus metrics

⸻

🛡️ Security
	•	All write endpoints (/proof, /next-job, /capture, /disputes) require:
	•	x-hmac-signature header (HMAC-SHA256)
	•	x-timestamp header (fresh RFC3339 UTC timestamp)
	•	Rate limiting enabled on /submit
	•	Helmet + CORS enabled by default
	•	Sensitive secrets must be stored in .env (never committed to Git)

⸻

📂 Folder Structure

api/
 ├── public/         # Static assets (badge.js, demo pages)
 ├── src/
 │   ├── routes/     # Capture, Verify, Corrections, Disputes, History
 │   ├── mw/         # Middleware (HMAC, Rate Limit, FreshTs)
 │   ├── crypto/     # Merkle proof verification
 │   ├── risk/       # Risk scoring module
 │   ├── store/      # ProofStore (append-only NDJSON)
 │   ├── cron/       # Daily Merkle root scheduler
 │   └── server.ts   # Main entrypoint
 └── package.json


⸻

🏷️ Embed Verification Badge (Demo)

<script src="https://your-api-domain.com/badge.js" defer></script>
<div data-privora-proof="PROOF_ID"></div>

	•	🟢 Verified → Proof exists & intact
	•	🟠 Check → Correction/dispute attached
	•	⚪️ Unverified → No proof found

⸻

📜 License

Licensed under the Apache License 2.0 – see LICENSE.
