#!/usr/bin/env node
/*
 * Owner queue: everything waiting on the owner, in one place.
 *
 * The owner makes the hard decisions and holds the accounts, but what waits
 * on them was spread over the setup tracker and the technical debt register
 * (2026-11-13). This lists:
 *   - setup steps (../setup-tracker.md) whose "Who" says "Owner action" and
 *     that are not ticked;
 *   - technical debt rows (../registers/tech-debt.md) that are not Done and
 *     say **Owner action:** or **Owner decision:** in bold.
 *
 * Writes owner-queue.md (the issue body) and prints it. Reads only files in
 * this repository, so it needs no token and never fails the build.
 *
 *   node engineering/automation/owner-queue.mjs              write the queue
 *   node engineering/automation/owner-queue.mjs --self-test  check the rules
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(' | ').map((c) => c.trim());
const REPOS = {
  carter: 'apaloo/TrashDrop-Mobile-Collector-Driver',
  collector: 'apaloo/TrashDrop-Mobile-Collector-Driver',
  admin: 'apaloo/TrashDrop_Management_webApp_admins',
  household: 'apaloo/TrashDrop-Mobile-User-Domestic',
};
// Issue text: no struck-out history, no bold, links as their text, and
// "carter #49" pointing at the collector repository rather than #49 here
const plain = (text) => text
  .replace(/~~[^~]*~~/g, '')
  .replace(/\*\*/g, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\b(carter|collector|admin|household) #([0-9]+)/g, (_, repo, n) => `${repo} ${REPOS[repo]}#${n}`)
  .replace(/\s+/g, ' ')
  .trim();
const URGENCY = ['now', 'in progress', 'next', 'later'];
const urgency = (when) => { const i = URGENCY.findIndex((u) => when.toLowerCase().startsWith(u)); return i < 0 ? URGENCY.length : i; };
const shorten = (text, max = 220) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Unticked setup steps for the owner: [{ id, step, phase }] */
export function setupSteps(markdown) {
  const out = [];
  let phase = '';
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) phase = line.slice(3).trim();
    if (!/^\| [0-9]{2}[a-z]? \|/.test(line)) continue;
    const c = cells(line);
    if (c.length < 5) continue;
    const [id, step, who, , done] = c;
    if (/owner action/i.test(who) && !done.includes('☑')) out.push({ id, step: shorten(plain(step)), phase });
  }
  return out;
}

/** Open technical debt rows marked for the owner: [{ id, kind, ask, when }] */
export function debtRows(markdown) {
  const out = [];
  for (const line of markdown.split('\n')) {
    if (!/^\| TD[0-9]+ \|/.test(line)) continue;
    const c = cells(line);
    if (c.length < 5) continue;
    const [id, , , when] = c;
    if (/^done/i.test(when)) continue;
    const marks = [...line.matchAll(/\*\*Owner (action|decision):\*\*\s*([^|]*?)(?=\*\*Owner (?:action|decision):\*\*|\s\||$)/g)];
    for (const m of marks) {
      // the marked text runs to the end of its sentence
      const ask = plain(m[2]).split(/(?<=[.?!])\s/)[0];
      out.push({ id, kind: m[1], ask: shorten(ask), when });
    }
  }
  // most urgent first; the register's order within the same urgency
  return out.map((d, i) => ({ d, i })).sort((x, y) => urgency(x.d.when) - urgency(y.d.when) || x.i - y.i).map((x) => x.d);
}

export function render({ steps, debt }, today) {
  const lines = [
    `Everything waiting on the owner as of ${today}, from \`engineering/setup-tracker.md\` and \`engineering/registers/tech-debt.md\`. Updated every Monday; tick a setup step or mark a register row Done in a pull request and it leaves this list.`,
    '',
    `### Decisions (${debt.filter((d) => d.kind === 'decision').length})`,
    '',
  ];
  const row = (d) => `- **${d.id}** (${d.when}): ${d.ask}`;
  const decisions = debt.filter((d) => d.kind === 'decision');
  lines.push(...(decisions.length ? decisions.map(row) : ['None.']));
  const actions = debt.filter((d) => d.kind === 'action');
  lines.push('', `### Actions (${actions.length + steps.length})`, '');
  lines.push(...actions.map(row));
  lines.push(...steps.map((s) => `- **Setup ${s.id}**: ${s.step}`));
  if (!actions.length && !steps.length) lines.push('None.');
  return lines.join('\n') + '\n';
}

function selfTest() {
  const assert = (ok, what) => { if (!ok) { console.error(`self-test failed: ${what}`); process.exit(1); } };
  const tracker = [
    '## Phase 1: Secure', '| # | Step | Who | Runbook | Done |', '|---|---|---|---|---|',
    '| 01 | Company **GitHub** organisation | Owner action | [01](x) | ☐ |',
    '| 02 | Projects board | Team | [02](x) | ☐ |',
    '| 09 | Legacy keys | Owner action | [09](x) | ☑ |',
    '| 07b | Add the token | Owner action, then Team | x | ☐ |',
  ].join('\n');
  const s = setupSteps(tracker);
  assert(s.map((x) => x.id).join() === '01,07b', 'only unticked owner steps');
  assert(s[0].step === 'Company GitHub organisation' && s[0].phase === 'Phase 1: Secure', 'plain step text and phase');

  const register = [
    '| ID | Item | Repo | When | Notes |', '|---|---|---|---|---|',
    '| TD1 | Done thing. **Owner decision:** old | all | Done | x |',
    '| TD2 | Postgres. **Owner action:** upgrade it. Then check sign-in | DB | Now | notes |',
    '| TD3 | Two asks | app | Next | **Owner decision:** keep or drop? More text. **Owner action:** rotate the key |',
    '| TD4 | Owner decision mentioned in passing, not marked | app | Next | x |',
  ].join('\n');
  const d = debtRows(register);
  assert(d.map((x) => `${x.id}:${x.kind}`).join() === 'TD2:action,TD3:decision,TD3:action', `marked open rows only (${JSON.stringify(d)})`);
  assert(d[0].ask === 'upgrade it.' && d[1].ask === 'keep or drop?' && d[2].ask === 'rotate the key', 'the ask is its own sentence');

  const md = render({ steps: s, debt: d }, '2026-11-13');
  assert(debtRows(register.replace('| DB | Now |', '| DB | Later |'))[0].id === 'TD3', 'most urgent first');
  assert(plain('See [the runbook](a/b.md) and carter #49 ~~old~~') === 'See the runbook and carter apaloo/TrashDrop-Mobile-Collector-Driver#49', 'issue-safe text');
  assert(md.includes('### Decisions (1)') && md.includes('### Actions (4)') && md.includes('- **Setup 07b**: Add the token'), 'renders both lists');
  assert(render({ steps: [], debt: [] }, 'x').split('None.').length === 3, 'empty lists say None');

  // the real files parse and the register uses the marker
  const real = debtRows(fs.readFileSync(path.join(root, 'engineering/registers/tech-debt.md'), 'utf8'));
  assert(real.length > 0, 'the register has marked rows');
  assert(setupSteps(fs.readFileSync(path.join(root, 'engineering/setup-tracker.md'), 'utf8')).length > 0, 'the tracker has owner steps');
  console.log('owner-queue self-test passed');
}

function main() {
  const steps = setupSteps(fs.readFileSync(path.join(root, 'engineering/setup-tracker.md'), 'utf8'));
  const debt = debtRows(fs.readFileSync(path.join(root, 'engineering/registers/tech-debt.md'), 'utf8'));
  const md = render({ steps, debt }, new Date().toISOString().slice(0, 10));
  console.log(md);
  fs.writeFileSync('owner-queue.md', md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Owner queue\n\n${md}`);
}

if (process.argv.includes('--self-test')) selfTest();
else main();
