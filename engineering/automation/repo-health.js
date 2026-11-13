// Monthly repository health across the TrashDrop repositories: are the
// engineering standards still in place, and what needs tidying?
// Used by cadence.js; reads other repositories with ENGINEERING_REPORT_TOKEN.
const { findCandidates } = require('./branch-cleanup');

const STANDARD_FILES = [
  ['CI workflow', ['.github/workflows/ci.yml', '.github/workflows/ci-cd.yml']],
  ['Security checks', ['.github/workflows/security.yml']],
  ['Dependabot', ['.github/dependabot.yml']],
  ['Code owners', ['.github/CODEOWNERS']],
  ['Pull request template', ['.github/pull_request_template.md']],
  ['Issue forms', ['.github/ISSUE_TEMPLATE/config.yml']],
  ['Secret-scan config', ['.gitleaks.toml']],
];
const KNOWN_FAILING = ['trashdrop/scripts/ci/known-failing-tests.txt', 'scripts/ci/known-failing-tests.txt'];
const OLD_PR_DAYS = 14;
// Dependabot is configured to propose updates weekly; none in this many days
// means its jobs are failing (seen 2026-11-12: two repositories never got one).
const DEPENDABOT_QUIET_DAYS = 35;

async function exists(gh, owner, repo, path) {
  try { await gh.rest.repos.getContent({ owner, repo, path }); return true; } catch { return false; }
}

async function readText(gh, owner, repo, path) {
  try {
    const { data } = await gh.rest.repos.getContent({ owner, repo, path });
    return Buffer.from(data.content || '', 'base64').toString('utf8');
  } catch { return null; }
}

async function checkRepo(gh, { owner, repo }, now) {
  const { data: info } = await gh.rest.repos.get({ owner, repo });
  const main = info.default_branch;
  const files = [];
  for (const [label, paths] of STANDARD_FILES) {
    let ok = false;
    for (const p of paths) if (await exists(gh, owner, repo, p)) { ok = true; break; }
    files.push({ label, ok });
  }
  let knownFailing = null;
  for (const p of KNOWN_FAILING) {
    const t = await readText(gh, owner, repo, p);
    if (t !== null) { knownFailing = t.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length; break; }
  }
  let mainProtected = null;
  try { mainProtected = (await gh.rest.repos.getBranch({ owner, repo, branch: main })).data.protected; } catch { /* unknown */ }
  const openPrs = await gh.paginate(gh.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 });
  const oldPrs = openPrs.filter((p) => (now - new Date(p.created_at)) / 86400000 >= OLD_PR_DAYS)
    .map((p) => ({ number: p.number, title: p.title, days: Math.floor((now - new Date(p.created_at)) / 86400000) }));
  const branches = await findCandidates({ github: gh, context: { repo: { owner, repo } } }, now);
  // GitHub's own security features (null when the token can't see them)
  const sa = info.security_and_analysis;
  const secretScanning = sa ? sa.secret_scanning?.status === 'enabled' && sa.secret_scanning_push_protection?.status === 'enabled' : null;
  let dependabotAlerts = null;
  try { await gh.request('GET /repos/{owner}/{repo}/vulnerability-alerts', { owner, repo }); dependabotAlerts = true; }
  catch (e) { if (e.status === 404) dependabotAlerts = false; }
  let dependabotRecent = null;
  if (files.find((f) => f.label === 'Dependabot')?.ok) {
    const recent = await gh.rest.pulls.list({ owner, repo, state: 'all', sort: 'created', direction: 'desc', per_page: 100 });
    dependabotRecent = recent.data.some((p) => p.user?.login === 'dependabot[bot]' && (now - new Date(p.created_at)) / 86400000 <= DEPENDABOT_QUIET_DAYS);
  }
  // Settings → General → "Automatically delete head branches"
  const autoDeleteBranches = typeof info.delete_branch_on_merge === 'boolean' ? info.delete_branch_on_merge : null;
  return { repo: `${owner}/${repo}`, visibility: info.private ? 'private' : 'public', main, files, knownFailing, mainProtected, oldPrs, branches, autoDeleteBranches, secretScanning, dependabotAlerts, dependabotRecent };
}

function render(results) {
  const tick = (v) => (v === true ? '✅' : v === false ? '❌' : '?');
  const lines = ['Monthly check that every repository still meets the engineering standards (engineering/policies/repository-governance.md), plus what to tidy.', ''];
  const ok = results.filter((r) => !r.skipped);
  if (ok.length) {
    lines.push(`| Check | ${ok.map((r) => r.repo.split('/')[1]).join(' | ')} |`);
    lines.push(`|---|${ok.map(() => '---').join('|')}|`);
    lines.push(`| Private repository | ${ok.map((r) => tick(r.visibility === 'private')).join(' | ')} |`);
    lines.push(`| \`main\` protected | ${ok.map((r) => tick(r.mainProtected)).join(' | ')} |`);
    for (const [label] of STANDARD_FILES) lines.push(`| ${label} | ${ok.map((r) => tick(r.files.find((f) => f.label === label)?.ok)).join(' | ')} |`);
    lines.push(`| Secret scanning + push protection | ${ok.map((r) => tick(r.secretScanning)).join(' | ')} |`);
    lines.push(`| Dependabot alerts | ${ok.map((r) => tick(r.dependabotAlerts)).join(' | ')} |`);
    lines.push(`| Dependabot opened a pull request in ${DEPENDABOT_QUIET_DAYS} days | ${ok.map((r) => tick(r.dependabotRecent)).join(' | ')} |`);
    lines.push(`| Known-failing test suites (target 0) | ${ok.map((r) => (r.knownFailing === null ? 'no list' : r.knownFailing)).join(' | ')} |`);
    lines.push(`| Pull requests open ${OLD_PR_DAYS}+ days | ${ok.map((r) => r.oldPrs.length).join(' | ')} |`);
    lines.push(`| Merged branches deleted automatically | ${ok.map((r) => tick(r.autoDeleteBranches)).join(' | ')} |`);
    lines.push(`| Branches to delete (merged / stale) | ${ok.map((r) => `${r.branches.merged.length} / ${r.branches.stale.length}`).join(' | ')} |`);
    lines.push('');
  }
  for (const r of results.filter((x) => x.skipped)) lines.push(`- **${r.repo}**: not checked (${r.skipped}).`);
  for (const r of ok) {
    const todo = [];
    r.oldPrs.forEach((p) => todo.push(`- [ ] Decide on #${p.number} "${p.title}" (open ${p.days} days): merge, update or close`));
    r.branches.merged.forEach((b) => todo.push(`- [ ] Delete merged branch \`${b}\``));
    r.branches.stale.sort((a, b) => b.days - a.days).forEach((b) => todo.push(`- [ ] Stale branch \`${b.name}\` (${b.days} days, ${b.ahead} unmerged commits): ask the author, then delete or open a pull request`));
    r.files.filter((f) => !f.ok).forEach((f) => todo.push(`- [ ] Add the missing ${f.label.toLowerCase()} (runbook 08 §Rolling out)`));
    if (r.visibility !== 'private') todo.push('- [ ] Make the repository private (runbook 01)');
    if (r.mainProtected === false) todo.push('- [ ] Protect `main` (runbook 08)');
    if (r.autoDeleteBranches === false) todo.push('- [ ] Turn on "Automatically delete head branches" (Settings → General → Pull Requests)');
    if (r.secretScanning === false) todo.push('- [ ] Turn on secret scanning and push protection (Settings → Code security)');
    if (r.dependabotAlerts === false) todo.push('- [ ] Turn on Dependabot alerts (Settings → Code security)');
    if (r.dependabotRecent === false) todo.push(`- [ ] Dependabot opened no pull request in ${DEPENDABOT_QUIET_DAYS} days although it is configured: check Insights → Dependency graph → Dependabot for failing update jobs`);
    if (todo.length) { lines.push('', `### ${r.repo}`, ...todo); }
  }
  return lines.join('\n');
}

module.exports = async ({ github, context, getOctokit }, repos, now = new Date()) => {
  const token = process.env.ENGINEERING_REPORT_TOKEN;
  const other = token && getOctokit ? getOctokit(token) : null;
  const results = [];
  for (const r of repos) {
    const gh = r.self ? github : other;
    if (!gh) { results.push({ repo: `${r.owner}/${r.repo}`, skipped: 'needs ENGINEERING_REPORT_TOKEN' }); continue; }
    try { results.push(await checkRepo(gh, r, now)); }
    catch (e) { results.push({ repo: `${r.owner}/${r.repo}`, skipped: `could not read (${e.status || e.message})` }); }
  }
  const needsAction = results.some((r) => r.skipped || r.oldPrs?.length || r.branches?.merged.length || r.branches?.stale.length
    || r.files?.some((f) => !f.ok) || r.visibility !== 'private' || r.mainProtected === false || r.autoDeleteBranches === false
    || r.secretScanning === false || r.dependabotAlerts === false || r.dependabotRecent === false);
  return { results, needsAction, body: render(results) };
};
module.exports.render = render;
module.exports.checkRepo = checkRepo;
