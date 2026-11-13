// Lists branches to delete: merged (fully in main, or its tip is the head of
// a merged pull request, which is how squash and rebase merges look), or with
// no commits for STALE_DAYS and no open pull request. Used by repo-health.js
// once a month.
// It only reports; people delete (repository-governance.md §Branches).
const STALE_DAYS = 60;

async function findCandidates({ github, context }, now = new Date()) {
  const { owner, repo } = context.repo;
  const { data: repoInfo } = await github.rest.repos.get({ owner, repo });
  const main = repoInfo.default_branch;
  const branches = await github.paginate(github.rest.repos.listBranches, { owner, repo, per_page: 100 });
  const openPrHeads = new Set((await github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 }))
    .map((p) => p.head?.ref));
  // Squash merges leave the branch "ahead" of main forever (2026-11-13: 54 of
  // the 170 merged branches across the three repositories looked unmerged)
  const mergedHeads = new Set((await github.paginate(github.rest.pulls.list, { owner, repo, state: 'closed', per_page: 100 }))
    .filter((p) => p.merged_at && p.head?.sha).map((p) => `${p.head.ref}@${p.head.sha}`));
  const merged = []; const stale = [];
  for (const b of branches) {
    if (b.name === main || b.protected || openPrHeads.has(b.name)) continue;
    if (mergedHeads.has(`${b.name}@${b.commit?.sha}`)) { merged.push(b.name); continue; }
    const cmp = await github.rest.repos.compareCommits({ owner, repo, base: main, head: b.name });
    if (cmp.data.ahead_by === 0) { merged.push(b.name); continue; }
    const { data: commit } = await github.rest.repos.getCommit({ owner, repo, ref: b.commit.sha });
    const last = new Date(commit.commit?.committer?.date || commit.commit?.author?.date);
    const days = Math.floor((now - last) / 86400000);
    if (days >= STALE_DAYS) stale.push({ name: b.name, days, ahead: cmp.data.ahead_by });
  }
  return { main, merged, stale };
}

function render({ main, merged, stale }) {
  const lines = [
    `Branches to tidy up (repository governance: merged branches are deleted; branches idle for ${STALE_DAYS} days are deleted after asking their author). Branches with an open pull request are left out.`,
    '',
  ];
  if (merged.length) {
    lines.push(`### Merged into \`${main}\` (safe to delete)`);
    merged.forEach((n) => lines.push(`- [ ] \`${n}\``));
    lines.push('');
  }
  if (stale.length) {
    lines.push(`### No commits for ${STALE_DAYS}+ days (ask the author, then delete or open a pull request)`);
    stale.sort((a, b) => b.days - a.days).forEach((s) => lines.push(`- [ ] \`${s.name}\`: ${s.days} days idle, ${s.ahead} commit(s) not in \`${main}\``));
    lines.push('');
  }
  lines.push('Tip: Settings → General → "Automatically delete head branches" stops merged branches piling up.');
  return lines.join('\n');
}

module.exports = { findCandidates, render, STALE_DAYS };
