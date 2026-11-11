# 03 · Google Workspace

**Who:** owner (billing) then Support Engineer · **Time:** 2 hours plus DNS propagation · **Cost:** per user per month, Business Starter or Standard

1. Sign up at workspace.google.com with the company domain (for example
   `trashdrops.com`). Verify the domain with the TXT record Google gives
   (DNS is managed wherever the domain is registered; record that in the
   [infrastructure register](../../registers/infrastructure.md)).
2. Add MX records and wait for mail to arrive, then add **SPF**, **DKIM**
   (Admin → Apps → Gmail → Authenticate email) and **DMARC**
   (`v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>`). The app's
   transactional email (Resend) needs its own SPF/DKIM entries on the same
   domain, so check both are present.
3. **Security** (Admin → Security):
   - 2-Step Verification **enforced** for all users, with a 1-week enrolment period
   - Less secure apps off; password length 12 or more
4. **Groups**, used as vendor account emails so that no account depends on one person:
   - `tech-admin@`: owner of all technology vendor accounts (CTO, Technical Lead)
   - `alerts@`: Sentry and uptime alerts (whole tech team)
   - `security@`: vulnerability reports (CTO)
   - `support@`: user support inbox (Support Engineer)
5. **Shared drive** "Technology": design files and large binaries moved out of
   git, signed policies, vendor contracts.
6. **Onboarding and offboarding:** create and suspend users only through an
   **Access request** issue, so the access register stays true.
