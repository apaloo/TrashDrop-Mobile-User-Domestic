# Cloud and infrastructure management

**Owner:** CTO (DevOps engineer operates) · **Review:** yearly

## Environments

| Environment | Database | Sites | Who changes it |
|---|---|---|---|
| Local | Staging (production until staging exists, read the onboarding warning) | `localhost` | Any engineer |
| Preview | Staging | Netlify deploy previews | Automatic per pull request |
| Production | Production Supabase project | Netlify production sites | Merge to `main`; database changes through the *Database migrations* workflow with approval |

## Rules

1. **Everything is code or recorded.** Database changes are migrations;
   Edge Functions are deployed from the repository (never from a laptop
   copy that differs); settings changed in a dashboard are written into the
   [infrastructure register](../registers/infrastructure.md) the same day.
2. **Company accounts.** Every provider account is owned by `tech-admin@`
   with at least two admins ([vendor management](vendor-management.md)).
3. **Least privilege for tokens.** Deploy and API tokens are per purpose,
   stored in GitHub environments or the password manager, and rotated yearly
   or when someone leaves.
4. **Cost control.** Monthly bills are checked against the budget in the
   CTO report; set spend alerts where the provider offers them (Google
   Cloud for Maps, Meta for WhatsApp). An unpaid invoice can get a project
   restricted, as happened in September 2026, so finance must have the billing contacts.
5. **Upgrades.** Database (Postgres) and runtime (Node) versions are kept
   within their providers' support windows; security upgrades within 30 days.
6. **Edge Functions** state their `verify_jwt` setting in
   `supabase/config.toml`; a function that turns it off must check the
   caller itself and say how in its header comment.
