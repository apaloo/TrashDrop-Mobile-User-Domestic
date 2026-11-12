// node engineering/automation/repo-health.test.cjs: offline checks with a fake GitHub client
const assert = require('assert');
const repoHealth = require('./repo-health');

function fakeGitHub({ alerts, sa, prs }) {
  const err = (status) => Object.assign(new Error(String(status)), { status });
  return {
    request: async () => { if (alerts === 'on') return { status: 204 }; throw err(alerts === 'off' ? 404 : 403); },
    paginate: async () => [],
    rest: {
      repos: {
        get: async () => ({ data: { default_branch: 'main', private: false, security_and_analysis: sa } }),
        getContent: async () => ({ data: { content: '' } }),
        getBranch: async () => ({ data: { protected: true } }),
        listBranches: async () => ({ data: [] }),
      },
      pulls: { list: async () => ({ data: prs }) },
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
  console.log('repo-health tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
