# Technology risk register

**Owner:** CTO · **Reviewed:** monthly (governance-cadence opens the issue)

Scores: likelihood × impact, each 1–5. Details of **open security
weaknesses are kept out of this file** while repositories are public; they are
tracked in the restricted CEO review and private security advisories.

| ID | Risk | L | I | Score | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R1 | Knowledge held by one developer; no peer review | 4 | 5 | 20 | Knowledge-transfer sessions; mandatory review; this handbook | CTO | Open |
| R2 | Source code public and in a personal account | 5 | 4 | 20 | Runbook 01: company organisation, private repositories | Owner | Open |
| R3 | Exposed credentials in git history | 3 | 5 | 15 | Keys rotated (Nov 2026); legacy keys clean-up (runbook 09); secret scanning in CI | Owner / CTO | Mitigating |
| R4 | One production database for three apps; no staging | 4 | 4 | 16 | Runbook 05; staged migrations; schema owner named | DevOps | Open |
| R5 | Database changes applied by hand; schema can't be rebuilt | 4 | 4 | 16 | Baseline + migration-history repair; manual SQL banned outside P1 | Technical Lead | Open |
| R6 | Payment and payout integrity | 3 | 5 | 15 | Server-side calculation (owner approval); reconciliation report; payout regression tests | Technical Lead | Open |
| R7 | No error monitoring or alerting | 5 | 3 | 15 | Sentry (runbook 06), uptime (runbook 07) | DevOps | Mitigating |
| R8 | Thin automated testing on carter and admin apps | 4 | 3 | 12 | Roll out CI (runbook 08 §Rolling out) | QA | Open |
| R9 | Outdated build toolchain (CRA, Node 16 on admin) | 3 | 3 | 9 | Phase 4 upgrade to Vite and Node 20 | Technical Lead | Open |
| R10 | Poor connectivity breaks field transactions | 3 | 4 | 12 | Offline queue and retries, idempotent server operations | Technical Lead | Open |
| R11 | Vendor accounts tied to personal emails | 3 | 4 | 12 | Move to `tech-admin@` with ≥2 admins | CTO | Open |
| R12 | Rising API costs (Maps, WhatsApp, SMS) | 3 | 3 | 9 | Monthly bill check; budget alerts | CTO | Open |
