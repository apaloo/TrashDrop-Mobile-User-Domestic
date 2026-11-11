# 07 · Uptime monitoring

**Who:** any engineer · **Time:** 30 minutes · **Recommended:** Better Stack Uptime free tier (UptimeRobot is an alternative)

1. Sign up with `tech-admin@`, enable 2FA, and invite the tech team.
2. Create monitors, checking every 3 minutes from European and other non-US regions:

| Monitor | Type | Check |
|---|---|---|
| Household app | HTTP | Household site URL returns 200 and contains "TrashDrop" |
| Carter app | HTTP | Carter site URL returns 200 |
| Admin portal / website | HTTP | trashdrops.com returns 200 |
| Supabase API | HTTP | `https://<project-ref>.supabase.co/auth/v1/health` with request header `apikey: <publishable key>` returns 200 |
| WhatsApp webhook | HTTP | Household site `/.netlify/functions/whatsapp-webhook` with **GET** and no verify token returns **403** ("Verification failed"); set the monitor to expect 403. This proves the function is deployed and running. |

3. Alerting: email `alerts@`, and SMS or phone for the on-call person on P1
   monitors (household, carter, Supabase).
4. Create a public status page (optional) for Operations to share with
   MMDAs and partners.
5. Monthly: copy the availability figure for each monitor into the CTO
   report (KPI: ≥99.5%).

**Alongside this:** the production smoke check (`.github/workflows/production-smoke.yml`)
runs every hour and 7 minutes after each household deploy. It checks more
than "the page loads": routing, pre-rendered public pages, the 404 page,
and that the WhatsApp and batch-lookup functions are deployed and
configured. It opens a `[Smoke] Production check failing` issue instead of
paging anyone, so it doesn't replace these monitors.
