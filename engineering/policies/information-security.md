# Information security policy

**Status:** Draft for management approval · **Owner:** Management, with the CTO · **Review:** yearly

This is the top-level policy. The detailed rules live in the policies it names.

## Purpose

To protect the people TrashDrop serves (households, carters, municipal
partners) and the company, by keeping personal data, payments and services
confidential, accurate and available.

## Scope

All TrashDrop staff, contractors and volunteers with system access; all
company systems, devices and accounts; all data TrashDrop holds, in any form.

## Principles

1. **Least privilege.** People and systems get only the access their work
   needs ([Access control](access-control.md)).
2. **The server decides.** Prices, payouts, permissions and personal data
   are protected in the database and server functions, never only in an app
   ([Secure development](secure-development.md)).
3. **Personal data is minimised and classified** ([Data protection controls](data-protection-controls.md)).
4. **Secrets are never shared in the open.** They live in the password
   manager and in the platforms that use them.
5. **Every change is reviewed and traceable** ([Change and release](change-and-release.md)).
6. **We assume things will fail.** We keep backups that have been tested
   ([Backup and recovery](backup-and-recovery.md)), and we watch for problems
   (Sentry, uptime monitoring, the daily security watch).
7. **Incidents are reported at once and handled without blame**
   ([Incident management](incident-management.md)).

## Responsibilities

| Who | Responsible for |
|---|---|
| CEO / Management | Approving this policy; risk appetite; resourcing |
| CTO | Implementing the controls; the risk register; reporting monthly |
| Data Protection Supervisor | Privacy obligations under Act 843; breach notification decisions |
| Every staff member | Following the policies; reporting incidents and suspicious activity at once to `security@` |

## Compliance

Breaches of this policy are handled under the staff disciplinary process.
Exceptions need the CTO's written approval, with an expiry date, recorded
in the risk register.
