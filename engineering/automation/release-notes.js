// Creates a GitHub Release for each successful production deploy from main,
// listing the pull requests it shipped since the previous release. Run by
// .github/workflows/release-notes.yml after the CI/CD workflow succeeds.
// Idempotent: a commit that already has a release is skipped.

const GROUPS = [
  ['Pricing and payouts (owner-approved)', ['protected-pricing']],
  ['Database', ['database']],
  ['Security', ['security', 'security-watch']],
  ['Bug fixes', ['type:bug']],
  ['Features', ['type:feature']],
  ['Dependencies', ['dependencies']],
];

function tagFor(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `release-${date.getUTCFullYear()}.${p(date.getUTCMonth() + 1)}.${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}`;
}

function groupOf(pr) {
  const names = (pr.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  for (const [title, labels] of GROUPS) if (labels.some((l) => names.includes(l))) return title;
  return 'Other changes';
}

function render(prs, { runUrl, sha, previousTag }) {
  const lines = [`Deployed to production from \`${sha.slice(0, 7)}\`${runUrl ? ` ([CI run](${runUrl}))` : ''}.`, ''];
  if (!prs.length) {
    lines.push(previousTag ? `No merged pull requests since ${previousTag} (direct commits only).` : 'First tracked release.');
    return lines.join('\n');
  }
  const order = [...GROUPS.map(([t]) => t), 'Other changes'];
  const byGroup = new Map();
  for (const pr of prs) { const g = groupOf(pr); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(pr); }
  for (const g of order) {
    if (!byGroup.has(g)) continue;
    lines.push(`### ${g}`);
    for (const pr of byGroup.get(g)) lines.push(`- ${pr.title} (#${pr.number}, @${pr.user?.login ?? 'unknown'})`);
    lines.push('');
  }
  if (previousTag) lines.push(`Changes since ${previousTag}.`);
  return lines.join('\n').trim();
}

module.exports = async ({ github, context, core }, { sha, runUrl, now = new Date() }) => {
  const { owner, repo } = context.repo;
  const releases = (await github.rest.repos.listReleases({ owner, repo, per_page: 30 })).data
    .filter((r) => r.tag_name.startsWith('release-'));

  if (releases.some((r) => r.target_commitish === sha)) { core.info(`Release for ${sha} already exists`); return null; }

  const previous = releases[0]; // newest first
  let prs = [];
  if (previous) {
    const prevSha = (await github.rest.git.getRef({ owner, repo, ref: `tags/${previous.tag_name}` })).data.object.sha;
    const cmp = await github.rest.repos.compareCommits({ owner, repo, base: prevSha, head: sha });
    const seen = new Map();
    for (const c of cmp.data.commits) {
      const assoc = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: c.sha });
      for (const pr of assoc.data) if (pr.merged_at && pr.base?.ref === 'main') seen.set(pr.number, pr);
    }
    prs = [...seen.values()].sort((a, b) => a.number - b.number);
  }

  const tag = tagFor(now);
  const body = render(prs, { runUrl, sha, previousTag: previous?.tag_name });
  const { data } = await github.rest.repos.createRelease({
    owner, repo, tag_name: tag, target_commitish: sha,
    name: `Production ${tag.replace('release-', '')} (${prs.length} change${prs.length === 1 ? '' : 's'})`,
    body,
  });
  core.info(`Created ${data.html_url}`);
  return data;
};
module.exports.render = render;
module.exports.tagFor = tagFor;
