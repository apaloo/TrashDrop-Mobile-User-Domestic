# 02 · GitHub Projects board

**Who:** any organisation member with project admin · **Time:** 20 minutes · **Cost:** free

1. Organisation → **Projects** → **New project** → template **Team planning**
   (or Board). Name: **TrashDrop Engineering**.
2. **Fields** (Settings → Custom fields):
   - `Status`: Inbox, Ready, In progress, In review, Done
   - `Priority`: P1, P2, P3, P4
   - `Product`: Household, Carter, Admin, WhatsApp, Website, Database, Corporate IT
   - `Iteration`: 2-week sprints
   - `Estimate`: number (points)
3. **Workflows** (⋯ → Workflows), and enable:
   - *Auto-add to project*, once per repository, filter `is:issue,pr is:open`
   - *Item closed* → Status Done; *Pull request merged* → Status Done
   - *Item added* → Status Inbox
4. **Views:**
   - **Sprint** (board by Status, filtered to the current iteration)
   - **Triage** (table, `label:needs-triage`)
   - **Incidents** (table, `label:type:incident`, sorted by Priority)
   - **Governance** (table, `label:governance`)
   - **Setup** (table, `label:setup`)
5. Pin the project to each repository (repository → Projects → Link a project).

The sprint completion KPI (programme §10.2, ≥85%) is read from the Sprint view
at the end of each iteration and entered in the monthly report.
