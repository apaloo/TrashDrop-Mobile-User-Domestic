# 01 · Company GitHub ownership

**Who:** the owner of the `apaloo` GitHub account · **Time:** 30 minutes · **Cost:** free (GitHub Free organisation); GitHub Team (about USD 4 per user per month) when protected branches and required reviews are needed on private repositories

## Decide: rename the account, or add an organisation

Neither option needs a new GitHub login.

| | **A. Add an organisation (recommended)** | **B. Rename the existing account** |
|---|---|---|
| What happens | The existing account creates a free organisation (for example `trashdrop`) and stays its owner. The repositories are transferred into it. | The username `apaloo` changes (for example to `trashdrop-tech`). It is still one person's account. |
| New login needed? | No | No |
| Team members with roles and teams | Yes | No, only "collaborators" on each repository |
| Enforce MFA for everyone | Yes, one setting | No |
| Remove a leaver everywhere at once | Yes | No, repository by repository |
| Company keeps the code if the person leaves | Yes, with a second owner | No, it belongs to the person |
| Links and integrations | GitHub redirects old repository URLs. Reconnect Netlify and Supabase to the new owner. | GitHub redirects old repository URLs. Reconnect Netlify and Supabase. The old username becomes free for anyone to claim. |

Option B changes the name but not the ownership. The plan's control
"company-owned source code repositories" needs option A. If you still prefer B,
do steps 3–6 below on the renamed account.

## Option A steps

1. Signed in as `apaloo`: avatar → **Your organizations** → **New organization**
   → plan **Free** → name `trashdrop` (or `trashdrop-gh` if taken) → contact email
   `tech-admin@<company domain>` → "My personal account" is the owner.
2. Organisation **Settings → Authentication security** → tick **Require
   two-factor authentication**.
3. **Add a second owner** (CEO or CTO) so the company is never locked out.
4. For each repository below: repository **Settings → General → Danger zone →
   Transfer ownership** → `trashdrop`:
   - `TrashDrop-Mobile-User-Domestic`
   - `TrashDrop-Mobile-Collector-Driver`
   - `TrashDrop_Management_webApp_admins`
5. In each transferred repository: **Settings → General → Danger zone → Change
   visibility → Private**.
6. **Archive** the inactive repositories (Settings → Archive):
   `TrashDrop_User`, `TrashDrop_Collector_User`, `TrashDrop_Mobile_User`. Make them private first.
7. **Teams** (Organisation → Teams): `tech-leads` (CTO, Technical Lead),
   `engineers`, `qa`, `support`. Give `engineers` **Write** and `tech-leads` **Maintain**
   on the three repositories.
8. Replace `@apaloo` in every `.github/CODEOWNERS` with `@trashdrop/tech-leads`
   (keep `@apaloo` on the owner-protected pricing lines).
9. **Reconnect deploys:** Netlify → each site → *Site configuration → Build &
   deploy → Link repository* (re-authorise the GitHub app for the
   organisation). Supabase → *Project settings → Integrations → GitHub*, if it is used.
10. Update badge URLs in `.github/README.md` (`apaloo` → `trashdrop`).

## Done when

- [ ] The three active repositories are private and in the organisation
- [ ] Two owners exist and 2FA is required
- [ ] Netlify deploys still run from `main`
- [ ] Inactive repositories are archived
