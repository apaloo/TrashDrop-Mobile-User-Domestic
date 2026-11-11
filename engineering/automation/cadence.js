// Opens the recurring governance issues. Called monthly by
// .github/workflows/governance-cadence.yml (and by hand with a chosen task).
const fs = require('fs');
const path = require('path');
const { ensureLabels } = require('./bootstrap');
const monthlyReport = require('./monthly-report');
const repoHealth = require('./repo-health');

const TASKS = {
  'backup-restore-test': { every: 'month', title: (p) => `[Governance] Backup restore test: ${p}`, file: 'backup-restore-test.md', owner: 'DevOps engineer' },
  'risk-review': { every: 'month', title: (p) => `[Governance] Risk review: ${p}`, file: 'risk-review.md', owner: 'CTO' },
  'access-review': { every: 'quarter', title: (p) => `[Governance] Quarterly access review: ${p}`, file: 'access-review.md', owner: 'CTO' },
};

function periodLabels(now) {
  const month = now.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return { month, quarter: `Q${q} ${now.getUTCFullYear()}`, isQuarterStart: now.getUTCMonth() % 3 === 0 };
}

async function openIfMissing({ github, context, core }, title, body, labels) {
  const { owner, repo } = context.repo;
  const existing = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'all', labels: labels[0], per_page: 100 });
  const found = existing.find((i) => i.title === title);
  if (found) { core.info(`exists: #${found.number} ${title}`); return null; }
  const { data } = await github.rest.issues.create({ owner, repo, title, body, labels });
  core.info(`created: #${data.number} ${title}`);
  return data;
}

module.exports = async ({ github, context, core, getOctokit }, { only = 'all', now = new Date() } = {}) => {
  await ensureLabels({ github, context, core });
  const { month, quarter, isQuarterStart } = periodLabels(now);
  const base = path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'engineering', 'checklists');
  const created = [];

  for (const [key, t] of Object.entries(TASKS)) {
    if (only !== 'all' && only !== key) continue;
    if (t.every === 'quarter' && only === 'all' && !isQuarterStart) continue;
    const label = t.every === 'quarter' ? quarter : month;
    const checklist = fs.readFileSync(path.join(base, t.file), 'utf8');
    const body = `**Owner:** ${t.owner} · **Due:** within 10 working days\n\n${checklist}\n\nClose this issue with the result in a comment.`;
    const issue = await openIfMissing({ github, context, core }, t.title(label), body, ['governance']);
    if (issue) created.push(issue.number);
  }

  if (only === 'all' || only === 'repo-health') {
    const health = await repoHealth({ github, context, getOctokit }, monthlyReport.reportRepos(context), now);
    if (health.needsAction) {
      const issue = await openIfMissing({ github, context, core }, `[Governance] Repository health: ${month}`, health.body, ['governance']);
      if (issue) created.push(issue.number);
    } else core.info('All repositories healthy');
  }

  if (only === 'all' || only === 'monthly-report') {
    const report = await monthlyReport({ github, context, core, getOctokit }, now);
    const issue = await openIfMissing({ github, context, core }, report.title, report.body, ['report:monthly', 'governance']);
    if (issue) created.push(issue.number);
  }

  core.summary.addHeading('Governance cadence').addRaw(created.length ? `Opened: ${created.map((n) => `#${n}`).join(', ')}` : 'Nothing new to open.');
  await core.summary.write();
};
module.exports.periodLabels = periodLabels;
