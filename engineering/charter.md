# Technology Department Charter

**Owner:** CEO and CTO · **Review:** yearly, or when the mandate changes

## Mandate

Design, develop, secure, operate and continuously improve TrashDrop's
technology, so that waste collection, recycling coordination, environmental
reporting and digital services run reliably and can grow.

## Scope

Software engineering, product technology, cloud infrastructure, corporate IT,
quality assurance, application support, and cybersecurity and data-protection
technical controls. The Data Protection Supervisor keeps their independent
statutory role. This department implements the technical controls they require.

## Products owned

| Product | Repository | Business owner | Technical owner |
|---|---|---|---|
| Household app (PWA) and WhatsApp booking | `TrashDrop-Mobile-User-Domestic` | Customer / Operations | Technical Lead |
| Carter app (PWA, Android TWA) | `TrashDrop-Mobile-Collector-Driver` | Operations | Technical Lead |
| Admin portal, environmental and MMDA reporting | `TrashDrop_Management_webApp_admins` | Operations / Management | Technical Lead |
| Public website (trashdrops.com) | `TrashDrop_Management_webApp_admins` (to be separated) | Marketing | Technical Lead |
| Shared database and server functions (Supabase) | all three (one owner to be named, see risk register) | Management | Technical Lead |

## Authority

The CTO sets technical standards, manages approved technology resources, and
approves production changes and access to production systems. Major
investments, recruitment and material technology changes go to the CEO under
the company's financial and procurement procedures.

## Protected business rules

Some rules are accepted by the owner and live in production. They change only
with the owner's written approval in the pull request:

- Digital bin pricing and promotions (`docs/DIGITAL_BIN_PRICING.md`, `CLAUDE.md`).
- Points: how they are earned, spent and counted (`docs/POINTS.md`, `CLAUDE.md`; protected 2026-11-12).
- Carter payouts and withdrawals, to be documented the same way (tech-debt register).

The security watch checks the database objects behind these rules every day
and fails if one changes without a recorded approval
([protected rules runbook](runbooks/protected-rules.md)).

## Reporting

- **Weekly:** delivery, support and incident review (team).
- **Monthly:** the CTO report to the CEO. It is drafted automatically on the 1st of each month as an issue labelled `report:monthly`, and the CTO completes it.
- **Quarterly:** management review (programme §14.3).
