# Vendor and licence register

**Owner:** CTO · **Checked:** monthly (cost), yearly (full review)

| Vendor | Purpose | Products | Personal data shared | Plan / monthly cost (GHS) | Account owner | Admins (≥2) | Exit notes |
|---|---|---|---|---|---|---|---|
| Supabase | Database, auth, storage, functions | all | Yes: all user data | _to fill_ | _to fill_ | _to fill_ | `pg_dump` + storage export; Postgres-standard |
| Netlify | Hosting, serverless functions | all | Request logs | _to fill_ | _to fill_ | _to fill_ | Static build + functions portable to Vercel/Cloudflare |
| GitHub | Code, CI, project management | all | No | Free → Team | _to fill_ | _to fill_ | git is portable |
| Meta (WhatsApp Cloud API) | WhatsApp booking and notifications | Household | Yes: phone numbers, messages | per conversation | _to fill_ | _to fill_ | Number can be migrated to another provider (BSP) |
| TrendiPay / BSL | MoMo collections and carter payouts | Carter | Yes: MoMo numbers, amounts | per transaction | _to fill_ | _to fill_ | Contract terms: _to fill_ |
| Google Cloud (Maps Platform) | Maps, navigation | Carter, Household | Locations | usage-based | _to fill_ | _to fill_ | Leaflet + OpenStreetMap already used in parallel |
| Resend | Transactional email | Admin | Emails, names | _to fill_ | _to fill_ | _to fill_ | Any SMTP provider |
| OpenStreetMap Nominatim | Reverse geocoding (area names) | Admin, Household | Coordinates | free (usage policy limits) | n/a | n/a | Self-host or a paid geocoder at volume |
| BigDataCloud | Reverse geocoding | Household | Coordinates | free tier | n/a | n/a | Consolidate with Nominatim |
| Google Identity | Sign in with Google | Household | Email, name | free | _to fill_ | _to fill_ | Email sign-in remains available |
| Facebook Graph API / X API | Social feeds on website | Admin | No | free | _to fill_ | _to fill_ | Optional feature |
| Google Workspace | Email, documents | Corporate | Staff data | per user | tech-admin@ | CEO, CTO | Google Takeout |
| Bitwarden | Password manager | Corporate | Secrets | per user | tech-admin@ | CEO, CTO | Export (encrypted) |
| Sentry | Error tracking | all | Scrubbed error data | free → Team | tech-admin@ | CTO, Tech Lead | Remove SDK |
| Better Stack | Uptime monitoring | all | No | free | tech-admin@ | CTO, Tech Lead | Recreate monitors elsewhere |
