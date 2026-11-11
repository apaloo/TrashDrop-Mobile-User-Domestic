# 04 · Password manager

**Who:** owner (billing) then CTO · **Time:** 1 hour · **Recommended:** Bitwarden Teams (or 1Password Business)

1. Create the organisation with `tech-admin@` as owner email, and add the CTO as a second owner.
2. Enforce two-step login for all members (Policies → Require two-step login).
3. Collections (who can see them):
   - **Production secrets:** Supabase production keys and database password, TrendiPay, Meta WhatsApp, Netlify tokens (CTO, Technical Lead, DevOps)
   - **Staging secrets** (all engineers)
   - **Vendor accounts:** shared logins that cannot be per-person (CTO, Technical Lead)
   - **Operations:** on-call phone, escalation contacts (tech team and Operations leads)
4. Move every secret that currently sits in personal notes, chats or `.env`
   files into the right collection. Then delete the old copies.
5. Record the move against each secret in the infrastructure register
   ("location: Bitwarden / Production secrets").
