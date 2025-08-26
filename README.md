<p align="center">
  <img src="./logo.png22" width="180" alt="Privora Logo">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge" alt="status" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=for-the-badge" alt="license" />
  <img src="https://img.shields.io/badge/build-passing-success?style=for-the-badge" alt="build" />
  <img src="https://img.shields.io/badge/contributions-welcome-orange?style=for-the-badge" alt="contributions" />
</p>

# 🔐 Privora

Privora is a **Confidential Computing & Verifiable AI framework** delivering **secure, transparent, and interoperable** infrastructure for enterprises and developers.  
It extends **Zero1 Labs MCP (Model Context Protocol)** with **TEE + ZK Proofs + Media Provenance**, ensuring trust, confidentiality, and verifiability across AI and blockchain applications.

---

👉 **One-line summary:**  
*Privora = Confidential Execution (TEE/FHE) + Attestation-bound Proofs + On-chain Verifiability + Media Provenance (Deepfake Defense)*

---

## 🔍 What Privora Adds on Top of Zero1 MCP

- **Confidential Compute** → Nitro Enclaves as default; optional FHE/MPC plugins  
- **Attestation Binding** → Enclave measurements bound into `contextHash` (CBOR `attestHash`)  
- **On-chain Proof Trails** → `ProofSubmittedV2` / `ProofBatchSubmittedV2` (Merkle root, modelHash, contextHash)  
- **Batching & Gas Efficiency** → 10–100+ jobs aggregated into 1 proof → drastic $gas/job reduction  
- **Secure Key Management** → KMS/HSM rotation; app never handles raw keys  
- **Guardian / Multisig** → `SubmitterProxy` with pause, block limits, idempotency TTL  
- **Production-Ready Ops** → SLOs, runbooks, Prometheus+Grafana alerts, DLQ/SQS integration  
- **SDK Verification** → `awaitProof()`, `verifySingleV2()`, `verifyBatchV2()` helpers  
- **Cost Guardrails** → Auto-switch to minimal-proof mode when p95 gas > cap  
- **PQC Ready** → Optional Kyber/Dilithium integration  
- **Media Integrity Pipeline** → Perceptual hashes (pHash/dHash/aHash) + C2PA manifest check + AI risk score + append-only proof trail  

---

## 🚀 Quickstart

```bash
# Clone
git clone git@github.com:your-org/privora.git
cd privora

# Install dependencies (root)
npm install

# Run API (dev mode)
cd api && npm run dev

# Run Worker (dev mode)
cd worker && npm run dev

# Or run both via helper script
./scripts/dev-run.sh


⸻

🏷️ Embed Verification Badge

To display a verification badge inside any webpage:

<script src="https://your-api-domain.com/badge.js" defer></script>
<div data-privora-proof="PROOF_ID"></div>

	•	🟢 Verified → Proof exists & intact
	•	🟠 Check → Correction/dispute attached
	•	⚪️ Unverified → No proof found

⸻

✨ Features
	•	✅ Confidential AI Layer → Secure model execution in TEE
	•	✅ Verifiable Outputs → ZK proofs for AI + blockchain computations
	•	✅ Idempotent API → Replay-resistant & tamper-proof calls
	•	✅ Modular Architecture → API, Worker, Proof, On-chain registry
	•	✅ Developer Friendly → SDK, demo scripts, example contracts
	•	✅ Media Provenance / Deepfake Defense → Fake media detection, C2PA check, risk scoring

⸻

💡 Use Cases
	•	🏦 Finance / DeFi → Confidential transactions, verifiable audits
	•	🏥 Healthcare → Secure data analysis & cross-institution research
	•	🤖 AI/ML → Private inference & verifiable training pipelines
	•	🎥 Media Provenance / Deepfake Defense → Fake video/image detection, C2PA verification, risk scoring
	•	🌐 Web3 / DAOs → Confidential voting, zk-governance proofs
	•	🏢 Enterprise SaaS → GDPR/HIPAA-compliant verifiable data handling

⸻

📂 Project Structure

privora/
 ├── api/         # API Layer (Express + HMAC/Nonce security)
 ├── worker/      # Worker (Proof & Queue processing)
 ├── sdk/         # SDK helpers (crypto, verification, submit)
 ├── contracts/   # Smart contracts (ProofRegistry, Verifier)
 ├── infra/       # Monitoring, dashboards, alert rules
 ├── scripts/     # Utility scripts (demo, cron)
 └── README.md


⸻

⚙️ Environment Setup

Create a .env file in the root:

# Server
PORT=4000
NODE_ENV=development

# Database
DB_URL=postgres://user:pass@localhost:5432/privora

# Blockchain
RPC_URL=https://your-chain-rpc
PRIVATE_KEY=your-private-key

# Security
HMAC_SECRET=super-secret-hmac
ENCLAVE_KEY_PATH=./keys/enclave.pem


⸻

📊 Tokenomics & Compliance
	•	Utility-First: Token is required for proof submission fees, staking, SLA tiers, and governance.
	•	Transparent Distribution: 1B PRV (60% emission, 20% foundation, 10% partners, 10% community).
	•	Deflationary: 20% of proof fees burned, 80% redistributed as staking rewards.
	•	Compliance-First:
	•	No ICO / No public fundraising → avoids securities classification risk.
	•	KYC/AML-ready for institutional integration.
	•	Audit-friendly for regulators and enterprises.
	•	Aligns with GDPR/HIPAA standards for data handling.

⸻

🗺️ Roadmap
	•	✅ Phase 1: Proof store + Merkle root + on-chain registry
	•	🚧 Phase 2: Attestation + TEE-bound proofs
	•	🚧 Phase 3: ZK integration (Groth16 / Plonk)
	•	🚧 Phase 4: Multi-chain relays (Base, Ethereum, Optimism)
	•	🚧 Phase 5: Privora SDK + Dashboard UI
	•	🚧 Phase 6: Media Provenance & Deepfake Defense POC

⸻

🤝 Contributing

Contributions, issues, and feature requests are welcome!
Open a PR or create an issue anytime.

⚠️ Security Note:
	•	Do NOT commit secrets, private keys, or production .env files.
	•	All commits are automatically scanned with gitleaks.
	•	Report vulnerabilities responsibly via SECURITY.md.

⸻

📜 License & Legal Disclaimer

Licensed under the Apache License 2.0 – see LICENSE.

Disclaimer:
Privora is provided “as is”, without warranty of any kind. The authors and contributors are not responsible for any damages, compliance breaches, or misuse of the software. Users are responsible for ensuring legal/regulatory compliance in their own jurisdictions.

---
