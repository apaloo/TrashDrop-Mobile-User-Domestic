# 04 · Password manager

**Who:** owner, then CTO · **Tool:** Bitwarden (cloud, US region) · **Status:** organisation created 2026-11-11 on the **Free** plan

## Current set-up

| Item | State |
|---|---|
| Organisation | **TrashDrop**, Free plan (max 2 users, 2 collections) |
| Billing contact | Company mailbox (move to `tech-admin@` once Google Workspace exists, runbook 03) |
| Members | 1 (owner) |
| Collections | none yet |
| Secrets Manager add-on | not enabled (not needed) |

## Two collections (free plan)

The free plan allows two collections, so secrets are grouped by how much
damage a leak would do:

| Collection | What goes in | Who |
|---|---|---|
| **Production secrets** | Anything that reads or moves real data or money: Supabase production secret key and database password, Supabase access token, TrendiPay API key and webhook secret, Meta WhatsApp access token and app secret, Netlify and GitHub tokens, Resend API key, Google Cloud (Maps) admin login | Owner and CTO only |
| **Shared accounts and operations** | Everything else the team needs: vendor dashboard logins that can't be per-person, test accounts for the apps, staging credentials (when staging exists), the contact sheet (on-call phone, escalation, vendor support numbers) | Owner and the second member |

Use [the secrets inventory](../../checklists/secrets-inventory.md) to move
every credential in, one by one.

## Steps still to do

1. **Turn on two-step login for the owner account now** (Account settings → Security → Two-step login; an authenticator app, not SMS). Save the recovery code offline. This account will hold every production key.
2. Create the two collections above (Admin Console → Collections).
3. Invite the second member, the CTO when hired, or else the most senior engineer (Admin Console → Members) with access to both collections. On the free plan, the two-step login *policy* (forcing it for all members) isn't available, so check by hand that they have it on.
4. Work through the secrets inventory: add each item to its collection, then **delete the old copy** (notes, chats, `.env` files on laptops, email).
5. Install the browser extension on both members' laptops (optional, but it reduces copy-pasting secrets).

## When to upgrade to Teams

Upgrade to **Bitwarden Teams** (about USD 4 per user per month) when **any** of these happens:
- a third person needs access (the free plan caps it at 2);
- Staging secrets need to be separate from production for engineers who mustn't see production;
- you want the *require two-step login* and *master password* policies, event logs, or groups.

Moving from Free to Teams keeps the organisation, collections and items; it
only changes billing (Admin Console → Billing → Subscription).
