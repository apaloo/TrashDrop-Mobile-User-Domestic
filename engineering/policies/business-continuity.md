# Business continuity plan (technology)

**Status:** Draft for management approval · **Owner:** Management / CTO · **Review:** yearly, and after every major incident

## Critical services

| Service | Who depends on it | Maximum tolerable outage | Manual fallback while it is down |
|---|---|---|---|
| Household app and WhatsApp booking | Households | 4 h | Operations takes bookings by phone/WhatsApp Business and enters them when service returns |
| Carter app (jobs, QR scanning) | Carters | 4 h | Carters work from a printed or shared job list; scans are recorded on paper (bag codes) and entered later |
| Payments and cash-outs (TrendiPay) | Carters, Finance | 24 h | Cash-outs paused; Finance pays urgent cases by direct MoMo with a manual record, reconciled later |
| Admin portal and reporting | Staff, MMDAs | 24 h | Reports delayed; urgent dumping reports handled by phone |
| Company email and documents | Staff | 24 h | Phone and WhatsApp groups |

## Scenarios and responses

| Scenario | Response | Owner |
|---|---|---|
| Database outage (Supabase) | Check the provider's status page; incident P1; switch to manual fallbacks; restore from backup only if data is lost ([Backup and recovery](backup-and-recovery.md)) | CTO |
| Hosting outage (Netlify) | Incident P1; the last good deploy can be served from another host from the git repository if the outage exceeds 4 h | DevOps |
| Payment provider outage | Pause cash-outs in the app; tell carters via Operations; manual fallback above | Finance + CTO |
| Account restricted for an unpaid bill | Finance pays at once; billing contacts and a backup payment card are kept current | Finance |
| Security breach | [Incident management](incident-management.md); Data Protection Supervisor informed; rotate secrets first | CTO + DPS |
| Loss of the only person who knows a system | Prevented by the handbook, runbooks, registers and two admins on every account | CTO |
| Office internet or power loss | Staff work from mobile data; laptops charged; critical work needs no office | Support |

## Readiness

- Contact sheet (staff, vendors, support numbers) in the password manager, *Shared accounts and operations* collection, reviewed quarterly.
- Backup restore tested monthly (governance-cadence issue).
- One tabletop exercise per year: walk a scenario above through with Operations and Finance; record what was learned as actions.
