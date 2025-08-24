# 🔐 Security Policy

This document defines how to report vulnerabilities, how we handle them, and safe-harbor rules for researchers.  
**File:** SECURITY.md (root level)

---

## Reporting a Vulnerability
If you discover a security vulnerability within **Privora**, please **do not create a public GitHub issue**.  
Instead, responsibly disclose by emailing: **security@privora.io**  

- Our PGP public key is available at: [https://privora.io/pgp.txt](https://privora.io/pgp.txt)  
- All security disclosures should be encrypted with this key.

We will:
- Acknowledge your report within **48 hours**  
- Provide a status update within **7 days**  
- For confirmed **critical issues**, aim to release a fix within **30 days**

---

## Supported Versions
| Version | Supported      |
|---------|----------------|
| `main`  | ✅ Always      |
| `dev`   | ⚠️ Best-effort |
| `old`   | ❌ Not supported |

---

## Scope (In-Scope)
This policy applies to:
- API endpoints (`/submit`, `/proof`, `/metrics`)  
- Worker node execution logic  
- Proof store (NDJSON + Merkle root)  
- Smart contracts (`ProofRegistry`, `SubmitterProxy`)  

---

## Out of Scope
- Attacks requiring **physical access** to hardware  
- **Social engineering** (phishing, impersonation, etc.)  
- Known issues in **third-party libraries** or outdated browsers  
- **Testnet / staging systems**, which may not be stable  

---

## Severity-Based SLA
- **Critical** → Fix target: 30 days (continuous updates until resolved)  
- **High** → Fix target: 60 days  
- **Medium** → Fix target: 90 days  
- **Low** → May be scheduled for a future release  

---

## Safe Harbor
We will not pursue legal action against researchers who:
- Perform testing only within the defined **in-scope** systems  
- Act in good faith to avoid privacy violations, service disruption, or data loss  
- Provide us with a reasonable amount of time to remediate before public disclosure  

Any research conducted under this policy will be considered **authorized** and **in good faith**.

---

## Rewards (Bug Bounty)
Currently, we do **not** operate a formal bug bounty program.  

However:
- Responsible disclosures may be eligible for **community recognition**  
- We are preparing to integrate with platforms like **HackerOne**, **Immunefi**, or **BugCrowd**  

---

✉️ Contact: X/holdonravn 
🔑 PGP Key: [https://privora.io/pgp.txt](https://privora.io/pgp.txt)
