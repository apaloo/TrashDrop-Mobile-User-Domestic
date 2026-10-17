#!/usr/bin/env node
/**
 * Upload whatsapp-flows/bin-pickup.flow.json to Meta's Flows API.
 *
 *   node scripts/upload-whatsapp-flow.js                 # update the Flow JSON
 *   node scripts/upload-whatsapp-flow.js --publish       # update, then publish
 *   node scripts/upload-whatsapp-flow.js --create        # create a new Flow
 *   node scripts/upload-whatsapp-flow.js --status        # report without writing
 *
 * Env:
 *   META_ACCESS_TOKEN         required — system user token with
 *                             whatsapp_business_management
 *   WHATSAPP_FLOW_ID          the Flow to update (FLOW_ID also accepted)
 *   META_BUSINESS_ACCOUNT_ID  required for --create only (the WABA id)
 *   FLOW_JSON_PATH            defaults to whatsapp-flows/bin-pickup.flow.json
 *   GRAPH_VERSION             defaults to v21.0
 *
 * Three things this deliberately does NOT do, each of which a previous version
 * did and each of which loses work silently:
 *
 *  - It never creates a Flow as a fallback. A create leaves you with a new id
 *    that WHATSAPP_FLOW_ID does not point at, so the site keeps sending the old
 *    Flow while you believe you just fixed it. Creating is opt-in via --create.
 *  - It never edits the Flow JSON on its way through. Stripping keys such as
 *    routing_model or data_api_version changes the Flow's behaviour without
 *    changing the file in git, so the repo stops describing what is deployed.
 *    What is in the file is what gets uploaded.
 *  - It never publishes unless asked. Publishing is irreversible in the sense
 *    that customers immediately start seeing the new version.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v21.0'}`;

const FLOW_JSON_PATH = process.env.FLOW_JSON_PATH
  ? path.resolve(process.env.FLOW_JSON_PATH)
  : path.join(__dirname, '..', 'whatsapp-flows', 'bin-pickup.flow.json');

const TOKEN = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
const FLOW_ID = process.env.WHATSAPP_FLOW_ID || process.env.FLOW_ID || null;
const WABA_ID = process.env.META_BUSINESS_ACCOUNT_ID || null;
const FLOW_NAME = process.env.FLOW_NAME || 'TrashDrop Digital Bin';

const args = new Set(process.argv.slice(2));
const DO_CREATE = args.has('--create');
const DO_PUBLISH = args.has('--publish');
const STATUS_ONLY = args.has('--status');

const log = (msg) => console.log(msg);
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

/**
 * Graph returns its errors as JSON with a 4xx, so a failed call is read the same
 * way as a successful one. Non-JSON bodies (gateway HTML, empty 5xx) are handed
 * back as text rather than throwing a parse error over the real failure.
 */
async function graph(url, options) {
  const res = await fetch(url, options);
  const raw = await res.text();

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { _raw: raw };
  }

  if (!res.ok) {
    const err = body.error || {};
    const detail = err.error_user_msg || err.message || body._raw || res.statusText;
    const e = new Error(`HTTP ${res.status}: ${detail}`);
    e.body = body;
    e.status = res.status;
    throw e;
  }

  return body;
}

/**
 * Meta reports Flow problems as a validation_errors array on the Flow itself and
 * on the response to an asset upload — not as an HTTP error. An upload that
 * "succeeded" can still leave a Flow that cannot be published, so these are
 * printed wherever they appear and treated as a failure by the caller.
 */
function printValidationErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return false;

  console.error(`\n✗ ${errors.length} validation error(s):`);
  for (const e of errors) {
    const where = e.pointers?.length
      ? e.pointers.map((p) => `${p.path || ''}${p.line_start ? `:${p.line_start}` : ''}`).join(', ')
      : e.line_start ? `line ${e.line_start}` : '';
    console.error(`  • [${e.error || e.error_type || 'error'}] ${e.message}${where ? `  (${where})` : ''}`);
  }
  console.error('');
  return true;
}

function loadFlowJson() {
  if (!fs.existsSync(FLOW_JSON_PATH)) {
    fail(`Flow JSON not found: ${FLOW_JSON_PATH}`);
  }

  const source = fs.readFileSync(FLOW_JSON_PATH, 'utf8');

  // Parsed only to catch a malformed file before it reaches Meta. The bytes
  // uploaded below are the file's own, not a re-serialisation of this object.
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    fail(`${path.basename(FLOW_JSON_PATH)} is not valid JSON: ${err.message}`);
  }

  log(`  file     ${path.relative(process.cwd(), FLOW_JSON_PATH)}`);
  log(`  version  ${parsed.version}`);
  log(`  screens  ${(parsed.screens || []).map((s) => s.id).join(' → ')}`);
  if (parsed.data_api_version) {
    log(`  endpoint data_api_version ${parsed.data_api_version} — this Flow expects an Endpoint URI`);
  }

  return source;
}

async function getFlow(flowId) {
  return graph(
    `${GRAPH}/${flowId}?fields=id,name,status,categories,validation_errors,updated_at`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

/**
 * Update the Flow JSON.
 *
 * This is the ONLY endpoint that updates Flow JSON. POST /<FLOW_ID> accepts just
 * name, categories and endpoint_uri — sending flow_json there changes nothing and
 * reports no error, which is how a Flow silently stays on an old version.
 */
async function uploadFlowJson(flowId, source) {
  const form = new FormData();
  form.append('name', 'flow.json');
  form.append('asset_type', 'FLOW_JSON');
  form.append('file', new Blob([source], { type: 'application/json' }), 'flow.json');

  // Content-Type is deliberately unset so fetch adds the multipart boundary
  const result = await graph(`${GRAPH}/${flowId}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });

  return result;
}

async function createFlow(source) {
  if (!WABA_ID) fail('--create needs META_BUSINESS_ACCOUNT_ID (your WABA id)');

  return graph(`${GRAPH}/${WABA_ID}/flows`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FLOW_NAME,
      categories: ['OTHER'],
      flow_json: source,
    }),
  });
}

async function publishFlow(flowId) {
  return graph(`${GRAPH}/${flowId}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
}

async function main() {
  if (typeof fetch !== 'function' || typeof FormData !== 'function') {
    fail(`Node ${process.version} has no global fetch/FormData — this needs Node 18 or newer.`);
  }
  if (!TOKEN) fail('META_ACCESS_TOKEN is not set');
  if (!TOKEN.startsWith('EAA')) {
    log('⚠ META_ACCESS_TOKEN does not start with "EAA" — a 32-char hex value is an App Secret, not a token');
  }

  // --- report only ---------------------------------------------------------
  if (STATUS_ONLY) {
    if (!FLOW_ID) fail('--status needs WHATSAPP_FLOW_ID');
    const flow = await getFlow(FLOW_ID);
    log(`\n${flow.name}  (${flow.id})`);
    log(`  status   ${flow.status}`);
    log(`  updated  ${flow.updated_at || 'unknown'}`);
    printValidationErrors(flow.validation_errors);
    return;
  }

  log('\nFlow JSON');
  const source = loadFlowJson();

  // --- create --------------------------------------------------------------
  if (DO_CREATE) {
    log('\nCreating a new Flow…');
    const created = await createFlow(source);

    if (printValidationErrors(created.validation_errors)) {
      fail(`Flow ${created.id} was created but its JSON is invalid — fix the errors above and re-run without --create.`);
    }

    log(`✓ created ${created.id}`);
    log('\nSet this on the Netlify site before it takes effect:');
    log(`  netlify env:set WHATSAPP_FLOW_ID ${created.id}`);
    return;
  }

  // --- update --------------------------------------------------------------
  if (!FLOW_ID) {
    fail('WHATSAPP_FLOW_ID is not set. Set it to the Flow you mean to update, or pass --create to make a new one.');
  }

  const before = await getFlow(FLOW_ID).catch((err) => {
    if (err.status === 404) {
      fail(`Flow ${FLOW_ID} does not exist, or this token cannot see it. Not creating one — check WHATSAPP_FLOW_ID.`);
    }
    throw err;
  });

  log(`\nUpdating "${before.name}" (${before.id}), currently ${before.status}`);

  const uploaded = await uploadFlowJson(FLOW_ID, source);

  if (printValidationErrors(uploaded.validation_errors)) {
    fail('Flow JSON was rejected — nothing was published.');
  }

  log('✓ Flow JSON uploaded');

  // --- publish -------------------------------------------------------------
  if (!DO_PUBLISH) {
    log(`\nStill ${before.status}. Re-run with --publish when you are ready to make it live.`);
    return;
  }

  log('\nPublishing…');
  try {
    await publishFlow(FLOW_ID);
  } catch (err) {
    printValidationErrors(err.body?.error?.error_data?.validation_errors || err.body?.validation_errors);
    throw err;
  }

  const after = await getFlow(FLOW_ID);
  log(`✓ published — status is now ${after.status}`);
  log('\nThe site sends a published Flow only when WHATSAPP_FLOW_MODE is "published" (the default).');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  if (err.body?.error?.error_user_title) {
    console.error(`  ${err.body.error.error_user_title}`);
  }
  process.exit(1);
});
