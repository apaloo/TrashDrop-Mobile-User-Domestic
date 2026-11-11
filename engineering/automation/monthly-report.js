// Drafts the monthly CTO report (programme §14.2) from GitHub data for the
// previous calendar month. Figures GitHub can't know (availability, cost,
// recruitment) are left as clearly marked blanks for the CTO.
const fs = require('fs');
const path = require('path');

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');

function previousMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const label = start.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, label };
}

function priorityOf(issue) {
  const fromLabel = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).find((n) => /^P[1-4]$/.test(n));
  if (fromLabel) return fromLabel;
  const m = /###\s*Priority\s*\n+\s*(P[1-4])/.exec(issue.body || '');
  return m ? m[1] : 'unset';
}

function knownFailingCount(workspace) {
  try {
    const file = path.join(workspace, 'trashdrop', 'scripts', 'ci', 'known-failing-tests.txt');
    return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
  } catch { return 'n/a'; }
}

async function collect({ github, context }, { start, end }) {
  const { owner, repo } = context.repo;
  const inRange = (d) => d && new Date(d) >= start && new Date(d) < end;

  // Pull requests merged into main in the month, and whether someone other than the author approved.
  const merged = [];
  for await (const page of github.paginate.iterator(github.rest.pulls.list, { owner, repo, state: 'closed', base: 'main', sort: 'updated', direction: 'desc', per_page: 100 })) {
    for (const pr of page.data) if (inRange(pr.merged_at)) merged.push(pr);
    const last = page.data[page.data.length - 1];
    if (!last || new Date(last.updated_at) < start) break;
  }
  let reviewed = 0;
  const unreviewed = [];
  for (const pr of merged) {
    const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number: pr.number, per_page: 100 });
    if (reviews.some((r) => r.state === 'APPROVED' && r.user && pr.user && r.user.login !== pr.user.login)) reviewed += 1;
    else unreviewed.push(pr);
  }

  // CI runs on main (each successful push run = a production deploy).
  let runs = [];
  try {
    runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
      owner, repo, workflow_id: 'ci-cd.yml', branch: 'main', event: 'push',
      created: `${start.toISOString().slice(0, 10)}..${new Date(end - 1).toISOString().slice(0, 10)}`, per_page: 100,
    });
  } catch { /* workflow may not exist in this repository */ }
  const done = runs.filter((r) => r.status === 'completed');
  const ok = done.filter((r) => r.conclusion === 'success');

  // Issues (not pull requests).
  const issues = (await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'all', since: start.toISOString(), per_page: 100 }))
    .filter((i) => !i.pull_request);
  const has = (i, name) => (i.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === name);
  const incidents = issues.filter((i) => has(i, 'type:incident') && inRange(i.created_at));
  const byPriority = incidents.reduce((acc, i) => { const p = priorityOf(i); acc[p] = (acc[p] || 0) + 1; return acc; }, {});
  const bugsOpened = issues.filter((i) => has(i, 'type:bug') && inRange(i.created_at)).length;
  const bugsClosed = issues.filter((i) => has(i, 'type:bug') && inRange(i.closed_at)).length;
  const openBugs = (await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: 'type:bug', per_page: 100 })).filter((i) => !i.pull_request).length;
  const openDeps = (await github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 }))
    .filter((p) => (p.labels || []).some((l) => l.name === 'dependencies')).length;
  const governance = issues.filter((i) => has(i, 'governance') && inRange(i.created_at));
  const governanceOpen = governance.filter((i) => i.state === 'open');

  return { merged, reviewed, unreviewed, runs: done.length, runsOk: ok.length, incidents, byPriority, bugsOpened, bugsClosed, openBugs, openDeps, governance, governanceOpen };
}

function render(m, { label }, { owner, repo, knownFailing }) {
  const prio = ['P1', 'P2', 'P3', 'P4', 'unset'].filter((p) => m.byPriority[p]).map((p) => `${p}: ${m.byPriority[p]}`).join(', ') || 'none';
  const TODO = '_CTO to fill_';
  return `# Technology report: ${label}

Drafted automatically from \`${owner}/${repo}\` on ${new Date().toISOString().slice(0, 10)}. The CTO completes the blanks, adds the other repositories' figures, and sends it to the CEO by the 5th working day.

## 1. Executive summary
${TODO}

## 2. Delivery (programme §10.2)
| KPI | Target | This month |
|---|---|---|
| Pull requests merged to main | n/a | ${m.merged.length} |
| Merged with approval from someone other than the author | 100% | ${pct(m.reviewed, m.merged.length)} (${m.reviewed}/${m.merged.length}) |
| CI runs on main that succeeded (release success) | ≥95% | ${pct(m.runsOk, m.runs)} (${m.runsOk}/${m.runs}) |
| Production deploys (successful main runs) | n/a | ${m.runsOk} |
| Sprint commitment completion | ≥85% | ${TODO} (Projects → Sprint view) |
| Known-failing test suites remaining | 0 | ${knownFailing} |
${m.unreviewed.length ? `\nMerged without independent approval: ${m.unreviewed.map((p) => `#${p.number}`).join(', ')}\n` : ''}
## 3. Platform performance (§10.1)
| KPI | Target | This month |
|---|---|---|
| Availability: household / carter / admin | ≥99.5% | ${TODO} (Better Stack) |
| New error types in Sentry | trend ↓ | ${TODO} |
| Critical backup coverage | 100% | ${TODO} (restore-test issue) |

## 4. Incidents and defects
- Incidents opened: **${m.incidents.length}** (${prio})${m.incidents.length ? `\n${m.incidents.map((i) => `  - #${i.number} ${i.title} (${i.state})`).join('\n')}` : ''}
- Bugs opened ${m.bugsOpened}, closed ${m.bugsClosed}; open now ${m.openBugs}
- Open dependency-update pull requests: ${m.openDeps}

## 5. QR Bag and Digital Bin workflow performance (§10.4)
${TODO}: scan success rate, Digital Bin request success rate, payout reconciliation differences (from the database).

## 6. Security and privacy
${TODO}: secret-scan findings, Dependabot critical/high alerts, access changes, any personal-data incident.

## 7. Infrastructure expenditure (GHS)
| Vendor | Budget | Actual |
|---|---|---|
| Supabase | | |
| Netlify | | |
| Google Maps | | |
| Meta WhatsApp | | |
| Other | | |

## 8. Recruitment and staffing
${TODO}

## 9. Governance tasks this month
${m.governance.length ? m.governance.map((i) => `- [${i.state === 'closed' ? 'x' : ' '}] #${i.number} ${i.title}`).join('\n') : '- none opened'}${m.governanceOpen.length ? `\n\n${m.governanceOpen.length} still open.` : ''}

## 10. Top risks and decisions needed from the CEO
${TODO} (from this month's risk review)
`;
}

module.exports = async ({ github, context, core }, now = new Date()) => {
  const period = previousMonth(now);
  const m = await collect({ github, context }, period);
  const { owner, repo } = context.repo;
  const markdown = render(m, period, { owner, repo, knownFailing: knownFailingCount(process.env.GITHUB_WORKSPACE || process.cwd()) });
  return { title: `[Report] Technology report: ${period.label}`, body: markdown };
};
module.exports.previousMonth = previousMonth;
module.exports.render = render;
module.exports.priorityOf = priorityOf;
