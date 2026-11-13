// Deletes branches that are merged into the default branch. Run by hand from
// .github/workflows/delete-merged-branches.yml (a dry run unless "delete" is
// ticked). Same file in the household, collector and admin repositories.
//
// A branch is merged when it is fully in main, or its tip is the head of a
// merged pull request (a squash merge leaves the branch "ahead" of main).
// Never touched: main, protected branches, branches with an open pull
// request, and branches that are only "fully in main" with a commit in the
// last MIN_AGE_HOURS (someone may have just created it to start work; a
// merged pull request's branch is done whatever its age). Each branch's tip is checked again
// just before it is deleted, so a branch that moved is kept.
//
//   node .github/scripts/delete-merged-branches.cjs --self-test
const MIN_AGE_HOURS = 24;

async function findMerged(github, { owner, repo }, now = new Date()) {
  const { data: info } = await github.rest.repos.get({ owner, repo });
  const main = info.default_branch;
  const branches = await github.paginate(github.rest.repos.listBranches, { owner, repo, per_page: 100 });
  const pulls = await github.paginate(github.rest.pulls.list, { owner, repo, state: 'all', per_page: 100 });
  const openHeads = new Set(pulls.filter((p) => p.state === 'open').map((p) => p.head?.ref));
  const mergedHeads = new Set(pulls.filter((p) => p.merged_at && p.head?.sha).map((p) => `${p.head.ref}@${p.head.sha}`));
  const merged = []; const kept = [];
  for (const b of branches) {
    if (b.name === main) continue;
    if (b.protected) { kept.push({ name: b.name, why: 'protected' }); continue; }
    if (openHeads.has(b.name)) { kept.push({ name: b.name, why: 'open pull request' }); continue; }
    if (mergedHeads.has(`${b.name}@${b.commit.sha}`)) { merged.push({ name: b.name, sha: b.commit.sha, how: 'pull request merged' }); continue; }
    // A branch fully in main may have just been created to start work
    const { data: c } = await github.rest.repos.getCommit({ owner, repo, ref: b.commit.sha });
    const date = new Date(c.commit?.committer?.date || c.commit?.author?.date);
    if (!(now - date >= MIN_AGE_HOURS * 3600000)) { kept.push({ name: b.name, why: `commit in the last ${MIN_AGE_HOURS} h` }); continue; }
    const { data: cmp } = await github.rest.repos.compareCommits({ owner, repo, base: main, head: b.commit.sha });
    if (cmp.ahead_by === 0) merged.push({ name: b.name, sha: b.commit.sha, how: `fully in ${main}` });
    else kept.push({ name: b.name, why: `${cmp.ahead_by} commit(s) not in ${main}` });
  }
  return { main, merged, kept };
}

async function deleteBranches(github, { owner, repo }, merged) {
  const deleted = []; const failed = [];
  for (const b of merged) {
    try {
      const { data: now } = await github.rest.repos.getBranch({ owner, repo, branch: b.name });
      if (now.commit.sha !== b.sha) { failed.push({ name: b.name, why: 'moved since it was listed' }); continue; }
      await github.rest.git.deleteRef({ owner, repo, ref: `heads/${b.name}` });
      deleted.push(b.name);
    } catch (e) { failed.push({ name: b.name, why: `${e.status || ''} ${e.message}`.trim() }); }
  }
  return { deleted, failed };
}

function summary({ main, merged, kept }, result, dryRun) {
  const lines = [dryRun
    ? `**Dry run:** ${merged.length} merged branch(es) would be deleted. Run again with "delete" ticked to delete them.`
    : `Deleted ${result.deleted.length} of ${merged.length} merged branch(es).`, ''];
  if (merged.length) {
    lines.push(`### Merged into \`${main}\``, '| Branch | Merged | Result |', '|---|---|---|');
    for (const b of merged) {
      const f = result?.failed.find((x) => x.name === b.name);
      lines.push(`| \`${b.name}\` | ${b.how} | ${dryRun ? 'would delete' : f ? `kept: ${f.why}` : 'deleted'} |`);
    }
    lines.push('');
  }
  if (kept.length) {
    lines.push('### Kept', '| Branch | Why |', '|---|---|');
    for (const k of kept) lines.push(`| \`${k.name}\` | ${k.why} |`);
  }
  return lines.join('\n');
}

async function run({ github, context, core }) {
  const dryRun = process.env.DELETE !== 'true';
  const found = await findMerged(github, context.repo);
  const result = dryRun ? null : await deleteBranches(github, context.repo, found.merged);
  await core.summary.addRaw(summary(found, result, dryRun)).write();
  core.info(dryRun ? `dry run: ${found.merged.length} would be deleted` : `deleted ${result.deleted.length}`);
  if (result?.failed.length) core.warning(`${result.failed.length} branch(es) not deleted; see the summary`);
}

async function selfTest() {
  const assert = require('assert');
  const now = new Date('2026-11-13T12:00:00Z');
  const old = '2026-11-01T00:00:00Z';
  const br = (name, sha, extra = {}) => ({ name, commit: { sha }, protected: false, ...extra });
  const branches = [br('main', 'm'), br('in-main', 'a'), br('squashed', 's'), br('reworked', 'r2'), br('unmerged', 'u'),
    br('just-made', 'j'), br('has-pr', 'p'), br('guarded', 'g', { protected: true }), br('moves', 'v')];
  const pulls = [
    { state: 'closed', merged_at: old, head: { ref: 'squashed', sha: 's' } },
    { state: 'closed', merged_at: old, head: { ref: 'reworked', sha: 'r1' } }, // commits added after it merged
    { state: 'closed', merged_at: null, head: { ref: 'unmerged', sha: 'u' } },
    { state: 'open', merged_at: null, head: { ref: 'has-pr', sha: 'p' } },
    { state: 'closed', merged_at: old, head: { ref: 'moves', sha: 'v' } },
  ];
  const ahead = { a: 0, r2: 2, u: 3, j: 0 };
  const dates = { j: '2026-11-13T09:00:00Z', s: '2026-11-13T08:00:00Z' }; // squashed: merged an hour ago
  const removed = [];
  const listBranches = async () => ({ data: branches });
  const listPulls = async () => ({ data: pulls });
  const gh = {
    paginate: async (fn) => (fn === listBranches ? branches : pulls),
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: 'main' } }),
        listBranches,
        getCommit: async ({ ref }) => ({ data: { commit: { committer: { date: dates[ref] || old } } } }),
        compareCommits: async ({ head }) => ({ data: { ahead_by: ahead[head] } }),
        getBranch: async ({ branch }) => ({ data: { commit: { sha: branch === 'moves' ? 'v2' : branches.find((b) => b.name === branch).commit.sha } } }),
      },
      pulls: { list: listPulls },
      git: { deleteRef: async ({ ref }) => { removed.push(ref); } },
    },
  };
  const found = await findMerged(gh, { owner: 'o', repo: 'r' }, now);
  assert.deepStrictEqual(found.merged.map((b) => b.name).sort(), ['in-main', 'moves', 'squashed']);
  assert.deepStrictEqual(Object.fromEntries(found.kept.map((k) => [k.name, k.why])), {
    reworked: '2 commit(s) not in main', unmerged: '3 commit(s) not in main', 'just-made': 'commit in the last 24 h',
    'has-pr': 'open pull request', guarded: 'protected',
  });
  const result = await deleteBranches(gh, { owner: 'o', repo: 'r' }, found.merged);
  assert.deepStrictEqual(removed.sort(), ['heads/in-main', 'heads/squashed']);
  assert.deepStrictEqual(result.failed, [{ name: 'moves', why: 'moved since it was listed' }]);
  assert.match(summary(found, null, true), /Dry run:\*\* 3 merged/);
  assert.match(summary(found, result, false), /Deleted 2 of 3[\s\S]*`moves` \| pull request merged \| kept: moved since it was listed/);
  console.log('delete-merged-branches self-test passed');
}

module.exports = run;
module.exports.findMerged = findMerged;
module.exports.deleteBranches = deleteBranches;
if (require.main === module && process.argv.includes('--self-test')) selfTest().catch((e) => { console.error(e); process.exit(1); });
