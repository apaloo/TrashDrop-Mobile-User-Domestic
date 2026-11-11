// Engineering bootstrap: creates labels and one issue per setup step.
// Safe to run more than once: existing labels are updated, and an issue is
// not created again if one with the same title exists (open or closed).
const labels = require('./labels');
const steps = require('./setup-issues');

async function ensureLabels({ github, context, core }) {
  const { owner, repo } = context.repo;
  const existing = await github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 });
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
  for (const l of labels) {
    const found = byName.get(l.name.toLowerCase());
    if (!found) {
      await github.rest.issues.createLabel({ owner, repo, ...l });
      core.info(`label created: ${l.name}`);
    } else if (found.color !== l.color || (found.description || '') !== l.description) {
      await github.rest.issues.updateLabel({ owner, repo, name: found.name, color: l.color, description: l.description });
      core.info(`label updated: ${l.name}`);
    }
  }
}

function body(step, serverUrl, owner, repo, ref) {
  const link = `${serverUrl}/${owner}/${repo}/blob/${ref}/${step.runbook}`;
  return [
    `Setup step **${step.id}** from the [setup tracker](${serverUrl}/${owner}/${repo}/blob/${ref}/engineering/setup-tracker.md).`,
    '',
    `**Runbook:** [${step.runbook}](${link})`,
    '',
    '### Done when',
    ...step.doneWhen.map((d) => `- [ ] ${d}`),
    '',
    'When done: tick the row in `engineering/setup-tracker.md`, update the registers the runbook names, and close this issue with a short note of what was set up (no secret values).',
  ].join('\n');
}

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  await ensureLabels({ github, context, core });

  const issues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'all', labels: 'setup', per_page: 100 });
  const titles = new Set(issues.map((i) => i.title));
  const ref = context.ref ? context.ref.replace('refs/heads/', '') : 'main';
  let created = 0;
  for (const step of steps) {
    if (titles.has(step.title)) { core.info(`exists: ${step.title}`); continue; }
    await github.rest.issues.create({
      owner, repo, title: step.title,
      body: body(step, context.serverUrl || 'https://github.com', owner, repo, ref),
      labels: ['setup', ...step.labels],
    });
    created += 1;
    core.info(`created: ${step.title}`);
  }
  core.summary.addHeading('Engineering bootstrap').addRaw(`Labels checked: ${labels.length}. Setup issues created: ${created}, already present: ${steps.length - created}.`);
  await core.summary.write();
};
module.exports.ensureLabels = ensureLabels;
