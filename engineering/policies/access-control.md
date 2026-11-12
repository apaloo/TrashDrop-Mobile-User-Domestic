# Access control policy

**Owner:** CTO · **Applies to:** every employee, contractor and service account · **Review:** yearly

## Rules

1. **One person, one account.** No shared logins. A system that only offers one
   login (for example a payment provider's dashboard) keeps it in the password
   manager, in a collection limited to named people, and the access register
   says who those people are.
2. **MFA everywhere it is offered**, and enforced at the organisation level on:
   GitHub, Google Workspace, Supabase, Netlify, the password manager, Sentry,
   Meta Business, TrendiPay and Google Cloud.
3. **Least privilege.** Access follows the job. Engineers get **staging**
   database access by default; **production** database access is limited to
   the CTO, the Technical Lead and the DevOps engineer.
4. **Admin access needs CTO approval** recorded on an **Access request** issue.
5. **Leavers lose access the same working day.** HR raises an Access request
   (Remove) before the last day; IT/Support removes access everywhere in the
   register and rotates any shared secret the person could see.
6. **Quarterly access review.** The governance-cadence workflow opens an issue
   on the first day of each quarter. The CTO checks every system against the
   [access register](../registers/access-register.md) and removes what is not
   needed.

## Secrets and keys

- Secrets live in the password manager and in the platform that uses them
  (GitHub Actions secrets, Netlify environment variables, Supabase secrets).
  **Never** in code, `.env` files in git, chat, email or issues.
- The Supabase **secret/service-role key** is used only on the server
  (Netlify functions, Edge Functions, GitHub Actions). A browser-exposed
  variable (`REACT_APP_*`, `VITE_*`) must never hold a secret.
- Rotate a secret immediately if it is exposed, and on a schedule (yearly) otherwise.
  Record each rotation in the [infrastructure register](../registers/infrastructure.md).

## Database roles inside the apps

Who can see or change data inside the product (households, carters, staff,
MMDA officers) is enforced by Postgres row-level security and `SECURITY
DEFINER` functions. It is never enforced by hiding buttons in the app. Any change to
these rules follows [Change and release](change-and-release.md) and needs the
Technical Lead's review. Admins are the accounts in the `staff_admins` table,
added and removed by an admin on the admin site's Account approvals page
(every change in Logs; the last admin can't be removed). No code or database
change is needed to add one, and no app keeps its own list of admins.
