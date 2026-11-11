# Incident management and application support

**Owner:** Application & IT Support Engineer (process), CTO (escalation) · **Review:** yearly

## Priorities

| Priority | Meaning | Examples | First response | Updates |
|---|---|---|---|---|
| **P1** | Platform down, payments failing, data exposed or corrupted | App won't load; carters can't withdraw; MoMo numbers exposed | 15 min | every 30 min |
| **P2** | A major feature unavailable, no workaround | QR scan fails for everyone; Digital Bin requests fail | 1 h | every 2 h |
| **P3** | Limited impact, workaround exists | Map tiles slow; one district's reports misfiled | 4 business hours | daily |
| **P4** | Minor defect or request | Typo; cosmetic issue | 1 business day | weekly |

These are proposed targets. Confirm them against actual support hours before
committing to them externally.

## Support levels

- **L1 (Support Engineer):** takes the report (WhatsApp, phone, email, in-app),
  reproduces, checks known issues and status, and helps the user. Opens a
  **Bug report** issue, or an **Production incident** issue for P1/P2.
- **L2 (engineers):** diagnoses code, database or infrastructure faults.
- **L3 (Technical Lead, CTO, external specialists):** security incidents,
  data repair, vendor escalation.

## During an incident

1. Open a **Production incident** issue. Name **one incident lead**.
2. Stabilise first: roll back the last deploy (Netlify → previous deploy) or
   switch off the failing feature. Diagnose after.
3. Keep the timeline in the issue, with the time against each action.
4. For P1/P2, tell affected users through Operations, in plain language.
5. **Security or personal-data incident:** tell the CTO and the Data
   Protection Supervisor at once. Preserve logs. Rotate any exposed secret
   before anything else.
6. Close only when the checklist in the issue is complete.

## After an incident

P1 and P2 incidents need a [post-incident review](../templates/postmortem.md)
within 5 working days. Reviews are blameless: they ask what made the failure
possible, not who caused it. Every action item becomes an issue with an
owner and a date.

## Contacts and tools

The on-call phone number, escalation phone numbers and vendor support contacts
are kept in the password manager (collection *Operations*), not in this
public file.
