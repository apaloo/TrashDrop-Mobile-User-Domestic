# Repository governance

**Owner:** Technical Lead · **Review:** yearly

## Ownership

- All code lives in the company GitHub organisation, in **private**
  repositories. No company code lives in personal accounts.
- Every repository has a `README.md` (what it is, how to run it), a
  `CODEOWNERS` file, the pull request template and the issue forms.

## Branches

- `main` is protected: pull request required; one approving review; required
  checks (CI, secret scan); no force pushes; no deletion; administrators are
  included.
- Branch names: `feat/`, `fix/`, `chore/`, `db/`, `docs/`. Merged branches are
  deleted automatically (repository setting).
- Branches inactive for 60 days are deleted after asking their author.

## What does not belong in git

- Secrets, `.env` files with real values, private keys, certificates.
- Logs, build output, backups (`*.bak`, `*.orig`), editor state, `.DS_Store`.
- One-off fix notes and ad-hoc SQL. Use pull request descriptions, and
  migrations in `supabase/migrations/`.
- Binaries over 1 MB (design files, posters). Keep them in Google Drive and
  link to them.

## Commit and pull request style

- Commit messages say what changed for the user or operator, in the present
  tense: "Carters see the cleanup photo step on arrival".
- One concern per pull request. Database migrations in their own pull request
  when they affect other apps.

## Reviews

The reviewer checks behaviour, security (the
[secure development](secure-development.md) principles), tests, and that the
author can explain the change. Approving means the reviewer shares
responsibility for it.
