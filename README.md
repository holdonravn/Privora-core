<p align="center">
  <img src="./logo.png" width="180" alt="Privora Logo">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge" alt="status" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=for-the-badge" alt="license" />
  <img src="https://img.shields.io/badge/build-passing-success?style=for-the-badge" alt="build" />
  <img src="https://img.shields.io/badge/contributions-welcome-orange?style=for-the-badge" alt="contributions" />
</p>

# 🔐 Privora

Privora is a **Confidential Computing & Verifiable AI framework** delivering **secure, transparent, and interoperable** infrastructure for enterprises and developers.  
It extends **Zero1 Labs MCP (Model Context Protocol)** with **TEE, ZK Proofs, and Media Provenance**, ensuring **trust, confidentiality, and verifiability** across AI and blockchain workflows.

---

👉 **One-line summary:**  
*Privora = Confidential Execution (TEE/FHE) + Attestation-bound Proofs + On-chain Verifiability + Media Provenance (Deepfake Defense)*

---

## 🔍 Key Differentiators

- **Confidential Compute** → Nitro Enclaves by default; optional FHE/MPC plugins  
- **Attestation Binding** → Enclave measurements hashed into `contextHash` (CBOR `attestHash`)  
- **On-chain Proof Trails** → `ProofSubmittedV2` / `ProofBatchSubmittedV2` (Merkle root, modelHash, contextHash)  
- **Batching & Gas Efficiency** → Aggregate 10–100+ jobs into one proof → massive cost reduction  
- **Secure Key Management** → KMS/HSM rotation, app never exposes raw keys  
- **Guardian / Multisig** → `SubmitterProxy` with pause, block limits, and idempotency TTL  
- **Ops-Ready** → SLOs, Prometheus+Grafana dashboards, DLQ/SQS integration, runbooks  
- **Developer Tooling** → SDK verification helpers (`awaitProof()`, `verifySingleV2()`)  
- **Quantum-Readiness** → Optional PQC (Kyber, Dilithium) support  
- **Media Integrity Pipeline** → pHash/dHash/aHash, C2PA manifest validation, AI risk scoring  

---

## 🚀 Quickstart

```bash
# Clone the repo
git clone git@github.com:your-org/privora.git
cd privora

# Install dependencies
npm install

# Start API (dev)
cd api && npm run dev

# Start Worker
cd worker && npm run dev

# Run both
./scripts/dev-run.sh


⸻

🏷️ Embed Verification Badge

<script src="https://your-api-domain.com/badge.js" defer></script>
<div data-privora-proof="PROOF_ID"></div>

Status	Meaning
🟢 Verified	Proof exists & verified
🟠 Check	Proof with corrections/disputes
⚪️ Unverified	No proof found


⸻

✨ Features
	•	✅ Confidential AI Layer → Private inference in TEE
	•	✅ Verifiable Outputs → ZK-proofed computations
	•	✅ Idempotent API → Replay-protected endpoints
	•	✅ Modular Architecture → API, Worker, Proof Store, Registry
	•	✅ Media Provenance → Deepfake detection & C2PA validation
	•	✅ Developer-Friendly → SDK, CLI, example contracts

⸻

💡 Use Cases
	•	🏦 Finance/DeFi → Confidential transactions, verifiable audits
	•	🏥 Healthcare → Secure medical data pipelines, multi-institution research
	•	🤖 AI/ML → Private model inference & verifiable training
	•	🎥 Media → Fake video/image detection & authenticity badges
	•	🌐 Web3/DAO → zk-governance, privacy-first voting
	•	🏢 Enterprise SaaS → GDPR/HIPAA-compliant data management

⸻

📂 Project Structure

privora/
 ├── api/         # API Layer (Express, HMAC/Nonce Security)
 ├── worker/      # Queue + Proof Processor
 ├── sdk/         # Crypto + Proof Verification Helpers
 ├── contracts/   # Smart Contracts
 ├── infra/       # Dashboards, Alert Rules
 ├── scripts/     # CLI & Automation
 └── README.md


⸻

⚙️ Environment Setup

.env example (never commit production secrets):

# Server
PORT=4000
NODE_ENV=development

# Redis & Queue
REDIS_URL=redis://localhost:6379

# Blockchain
RPC_URL=https://your-chain-rpc
PRIVATE_KEY=your-private-key

# Security
HMAC_KEYS=default=super-secret-hmac
BADGE_SCRIPT_ORIGIN=https://cdn.yourdomain.com


⸻

📊 Tokenomics & Compliance
	•	Utility-First Token: Proof fees, staking, SLA tiers, governance
	•	Supply: 1B PRV (60% emission, 20% foundation, 10% partners, 10% community)
	•	Deflationary: 20% of proof fees burned
	•	No ICO / No Public Fundraise → Minimizes regulatory risk
	•	GDPR/HIPAA Aligned → Compliance-first design

⸻

🗺️ Roadmap
	•	✅ Phase 1: Proof store + Merkle root
	•	🚧 Phase 2: TEE-bound proofs
	•	🚧 Phase 3: ZK integrations (Plonk, Groth16)
	•	🚧 Phase 4: Multi-chain support (Base, Optimism)
	•	🚧 Phase 5: SDK + Dashboard
	•	🚧 Phase 6: Media Provenance Engine

⸻

🤝 Contributing

We welcome contributions!
PRs and issues are open for all developers.

⚠️ Security:
	•	No private keys or secrets in commits
	•	CI enforces gitleaks scan
	•	Report vulnerabilities responsibly (see SECURITY.md)

⸻

📜 License

Apache License 2.0 – see LICENSE for details.
Privora is provided “as is”, without warranty of any kind.

---
