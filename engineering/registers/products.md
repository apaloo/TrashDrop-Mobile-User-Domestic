# Product register

**Owner:** CTO · **Updated:** when a product, repository or owner changes · **Checked:** quarterly review

| Product | Users | Repository | Stack | Hosting | Business owner | Technical owner | Status |
|---|---|---|---|---|---|---|---|
| Household app | Households (Ghana) | `TrashDrop-Mobile-User-Domestic` (`trashdrop/`) | React 18, CRA + craco, JavaScript, Leaflet + Google Maps, PWA | Netlify (site + functions) | Customer / Operations | Technical Lead | Live |
| WhatsApp booking | Households | `TrashDrop-Mobile-User-Domestic` (`trashdrop/netlify/functions/whatsapp-*`) | Netlify functions, Meta WhatsApp Cloud API | Netlify | Customer / Operations | Technical Lead | Live |
| Carter app | Carters / collectors | `TrashDrop-Mobile-Collector-Driver` | React 18, Vite, JavaScript, Leaflet + Google Maps, PWA; Android TWA `com.trashdrop.carter` | Netlify + Supabase Edge Functions | Operations | Technical Lead | Live |
| Carter payments | Carters | `TrashDrop-Mobile-Collector-Driver` (`supabase/functions/trendipay-*`) | Supabase Edge Functions, TrendiPay/BSL MoMo | Supabase | Finance / Operations | Technical Lead | Live |
| Admin portal | Staff, MMDA officers, volunteers, media | `TrashDrop_Management_webApp_admins` | React 18, CRA, JavaScript, Chart.js, Leaflet | Netlify + Supabase (cron, Edge Functions) | Operations / Management | Technical Lead | Live |
| Public website | Public | `TrashDrop_Management_webApp_admins` (public pages) | Same as admin portal, pre-rendered | Netlify | Marketing | Technical Lead | Live; to be separated |
| Shared database | All apps | Migrations in all three repositories | Supabase Postgres, RLS, RPCs, pg_cron | Supabase | Management | Technical Lead | Live; single owner to be named |
| Data and intelligence | Management | none yet | n/a | n/a | Management / Operations | Technical Lead | Planned |

## Inactive repositories (archive)

`TrashDrop_User` (last push Apr 2025), `TrashDrop_Collector_User` (Jun 2025),
`TrashDrop_Mobile_User` (Jun 2025).
