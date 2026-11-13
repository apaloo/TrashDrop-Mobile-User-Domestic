// node engineering/automation/repo-health.test.cjs: offline checks with a fake GitHub client
const assert = require('assert');
const repoHealth = require('./repo-health');

function fakeGitHub({ alerts, sa, prs, autoDelete = true, branches = [], openPrs = [], closedPrs = [], ahead = {}, commitDates = {} }) {
  const err = (status) => Object.assign(new Error(String(status)), { status });
  const listBranches = async () => ({ data: branches });
  const listPulls = async () => ({ data: prs });
  return {
    request: async () => { if (alerts === 'on') return { status: 204 }; throw err(alerts === 'off' ? 404 : 403); },
    paginate: async (fn, params) => {
      if (fn === listBranches) return branches;
      if (fn === listPulls) return params.state === 'open' ? openPrs : closedPrs;
      return [];
    },
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: 'main', private: false, security_and_analysis: sa, delete_branch_on_merge: autoDelete } }),
        getContent: async () => ({ data: { content: '' } }),
        getBranch: async () => ({ data: { protected: true } }),
        listBranches,
        compareCommits: async ({ head }) => ({ data: { ahead_by: ahead[head] ?? 0 } }),
        getCommit: async ({ ref }) => ({ data: { commit: { committer: { date: commitDates[ref] } } } }),
      },
      pulls: { list: listPulls },
    },
  };
}
const on = { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } };
const now = new Date('2026-11-12T21:00:00Z');

(async () => {
  // The carter and admin repositories on 2026-11-12: alerts off, Dependabot silent
  const silent = await repoHealth.checkRepo(fakeGitHub({ alerts: 'off', sa: on, prs: [{ user: { login: 'someone' }, created_at: '2026-11-12T10:00:00Z' }] }), { owner: 'o', repo: 'r' }, now);
  assert.strictEqual(silent.secretScanning, true);
  assert.strictEqual(silent.dependabotAlerts, false);
  assert.strictEqual(silent.dependabotRecent, false);
  const body = repoHealth.render([silent]);
  assert.match(body, /Turn on Dependabot alerts/);
  assert.match(body, /Dependabot opened no pull request in 35 days/);

  // Healthy: alerts on, a recent Dependabot pull request
  const healthy = await repoHealth.checkRepo(fakeGitHub({ alerts: 'on', sa: on, prs: [{ user: { login: 'dependabot[bot]' }, created_at: '2026-11-11T23:33:00Z' }] }), { owner: 'o', repo: 'r' }, now);
  assert.deepStrictEqual([healthy.dependabotAlerts, healthy.dependabotRecent], [true, true]);
  assert.doesNotMatch(repoHealth.render([healthy]), /Turn on Dependabot alerts|opened no pull request/);

  // An old Dependabot pull request is not enough; unknown permissions stay unknown
  const stale = await repoHealth.checkRepo(fakeGitHub({ alerts: 'forbidden', sa: undefined, prs: [{ user: { login: 'dependabot[bot]' }, created_at: '2026-09-01T00:00:00Z' }] }), { owner: 'o', repo: 'r' }, now);
  assert.deepStrictEqual([stale.dependabotAlerts, stale.secretScanning, stale.dependabotRecent], [null, null, false]);

  // Branches (2026-11-13): squash-merged branches stay "ahead" of main but
  // their tip is the head of a merged pull request, so they are merged
  const br = (name, sha) => ({ name, commit: { sha }, protected: false });
  const tidy = await repoHealth.checkRepo(fakeGitHub({
    alerts: 'on', sa: on, prs: [], autoDelete: false,
    branches: [br('main', 'm0'), br('in-main', 'a1'), br('squashed', 's1'), br('reworked', 'r2'), br('old-idea', 'o1'), br('fresh', 'f1'), br('has-pr', 'p1')],
    openPrs: [{ head: { ref: 'has-pr', sha: 'p1' } }],
    closedPrs: [
      { merged_at: '2026-11-12T00:00:00Z', head: { ref: 'squashed', sha: 's1' } },
      { merged_at: '2026-08-01T00:00:00Z', head: { ref: 'reworked', sha: 'r1' } }, // commits added after it merged
      { merged_at: null, head: { ref: 'old-idea', sha: 'o1' } },                    // closed without merging
    ],
    ahead: { squashed: 3, reworked: 4, 'old-idea': 2, fresh: 1 },
    commitDates: { r2: '2026-08-02T00:00:00Z', o1: '2026-05-01T00:00:00Z', f1: '2026-11-10T00:00:00Z' },
  }), { owner: 'o', repo: 'r' }, now);
  assert.deepStrictEqual(tidy.branches.merged.sort(), ['in-main', 'squashed']);
  assert.deepStrictEqual(tidy.branches.stale.map((b) => b.name).sort(), ['old-idea', 'reworked']);
  assert.strictEqual(tidy.autoDeleteBranches, false);
  const tidyBody = repoHealth.render([tidy]);
  assert.match(tidyBody, /Delete merged branch `squashed`/);
  assert.match(tidyBody, /Turn on "Automatically delete head branches"/);
  assert.doesNotMatch(tidyBody, /`fresh`|`has-pr`/);
  assert.doesNotMatch(repoHealth.render([healthy]), /Automatically delete head branches"/);
  console.log('repo-health tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
