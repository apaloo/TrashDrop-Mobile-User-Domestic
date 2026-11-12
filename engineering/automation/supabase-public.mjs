// Fills SUPABASE_URL, SUPABASE_PROJECT_REF and SUPABASE_PUBLISHABLE_KEY from
// supabase-public.json when they are not set, so the scheduled watches run
// before the repository variables exist. A set variable always wins. Not on
// pull requests: those keep testing the scripts only, never production.
// Only public values live in that file; secrets never get a default.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'supabase-public.json');
const SECRET_LOOKING = /^(sb_secret_|eyJ)|SECRET|SERVICE_ROLE|TOKEN/i;

export function publicDefaults() {
  const values = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  delete values._comment;
  for (const [name, value] of Object.entries(values)) {
    if (SECRET_LOOKING.test(name) || SECRET_LOOKING.test(value)) {
      throw new Error(`${FILE}: ${name} looks like a secret; only public values belong there`);
    }
  }
  return values;
}

export function applyPublicDefaults(env = process.env) {
  if (env.GITHUB_EVENT_NAME === 'pull_request') return [];
  const applied = [];
  for (const [name, value] of Object.entries(publicDefaults())) {
    if (!env[name]) { env[name] = value; applied.push(name); }
  }
  return applied;
}
