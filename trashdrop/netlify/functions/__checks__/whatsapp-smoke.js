/**
 * Smoke checks for the WhatsApp booking layer.
 *
 *   node netlify/functions/__checks__/whatsapp-smoke.js
 *
 * Runs the real webhook handler and conversation engine against stubbed
 * WhatsApp and Supabase clients. No network, no database, no credentials.
 * Covers the paths that have actually broken before: signature rejection,
 * redelivery, Flow completion, and the fallback when the Flow cannot be sent.
 */
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const FN = path.join(__dirname, '..');
const UTILS = path.join(FN, 'utils');

process.env.META_APP_SECRET = 'test_secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify123';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'PNID';
process.env.WHATSAPP_ACCESS_TOKEN = 'TOKEN';
process.env.WHATSAPP_FLOW_ID = '2122136435396715';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE = 'h.' + Buffer.from(
  JSON.stringify({ role: 'service_role', ref: 'test' })).toString('base64url') + '.s';

// ---- stubs -----------------------------------------------------------------
const apiPath = path.join(UTILS, 'whatsapp-api.js');
const realApi = require(apiPath);
let sent = [];
let failFlow = false;
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
  ...realApi,
  sendTextMessage: async (t, x) => sent.push({ k: 'text', x }),
  sendListMessage: async (t, o) => sent.push({ k: 'list', x: o.bodyText }),
  sendButtonMessage: async (t, o) => sent.push({ k: 'btn', x: o.bodyText }),
  sendImageMessage: async () => sent.push({ k: 'image', x: 'qr' }),
  sendFlowMessage: async (t, o) => {
    if (failFlow) throw new Error('(#132000) Flow not published');
    sent.push({ k: 'flow', x: o.bodyText, payload: o });
  },
  uploadMedia: async () => 'media-id',
  markAsRead: async () => {},
}};

const seen = new Set();
const rpcCalls = [];
const sbPath = require.resolve('@supabase/supabase-js', { paths: [path.join(FN, '../..')] });
require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: {
  createClient: () => ({
    rpc: async (n, a) => {
      rpcCalls.push(n);
      if (n === 'record_whatsapp_message') {
        if (seen.has(a.p_message_id)) return { data: false, error: null };
        seen.add(a.p_message_id); return { data: true, error: null };
      }
      if (n === 'get_active_whatsapp_session') {
        return { data: [{ session_id: 's1', whatsapp_user_id: 'wa1', state: 'idle', collected_data: {} }], error: null };
      }
      if (n === 'find_nearest_pricing_zone') return { data: [{ price_120l: 30 }], error: null };
      if (n === 'create_whatsapp_digital_bin') return { data: 'bin-1', error: null };
      return { data: null, error: null };
    },
    from: (t) => { const q = { select: () => q, update: () => q, eq: () => q, or: () => q,
      in: () => q, order: () => q, limit: () => q,
      single: async () => t === 'digital_bins'
        ? { data: { qr_code_url: 'https://trashdrop.app/bin/bin-1' }, error: null }
        : t === 'promotional_usage' ? { data: null, error: { message: 'none' } }
        : { data: { id: 'wa1', user_id: null }, error: null },
      then: (r) => r({ data: null, error: null }) }; return q; },
  }),
}};

const { handler } = require(path.join(FN, 'whatsapp-webhook.js'));
const { processMessage, STATES } = require(path.join(UTILS, 'conversation-engine.js'));

const sign = (b) => 'sha256=' + crypto.createHmac('sha256', 'test_secret').update(b, 'utf8').digest('hex');
const envelope = (msg) => JSON.stringify({ entry: [{ changes: [{ value: {
  contacts: [{ profile: { name: 'Ama' } }], messages: [msg] } }] }] });
const post = (body, sig) => handler({ httpMethod: 'POST', headers: sig ? { 'x-hub-signature-256': sig } : {}, body });

let passed = 0;
const check = (label, fn) => { try { fn(); console.log('  ok   ' + label); passed++; }
  catch (e) { console.log('  FAIL ' + label + '\n       ' + e.message); process.exitCode = 1; } };

// ---- webhook ---------------------------------------------------------------
(async () => {
  console.log('webhook');
  const body = envelope({ id: 'wamid.1', from: '233244000000', timestamp: '1', type: 'text', text: { body: 'hi' } });

  let r = await post(body, null);
  check('unsigned POST is rejected', () => assert.strictEqual(r.statusCode, 401));

  r = await post(body, sign('{}'));
  check('wrong signature is rejected', () => assert.strictEqual(r.statusCode, 401));

  rpcCalls.length = 0;
  r = await post(body, sign(body));
  check('valid signature is processed', () => {
    assert.strictEqual(r.statusCode, 200);
    assert.ok(rpcCalls.includes('get_active_whatsapp_session'));
  });

  rpcCalls.length = 0;
  await post(body, sign(body));
  check('redelivery is skipped', () =>
    assert.ok(!rpcCalls.includes('get_active_whatsapp_session'), 'session was touched on replay'));

  // ---- engine --------------------------------------------------------------
  console.log('booking flow');
  const LOC = { type: 'location', location: { latitude: 5.56, longitude: -0.2057, name: 'Osu Home', address: '12 Oxford St' } };
  const GOOD = { flow_token: 's1', frequency: 'one-time', start_date: null, preferred_time: 'afternoon',
    bag_count: '2', bin_size_liters: '120', waste_type: 'general', is_urgent: false, notes: 'Blue gate' };
  GOOD.start_date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date());

  const supabase = require(sbPath).createClient();
  const session = { id: 's1', whatsapp_user_id: 'wa1', state: STATES.IDLE, collected_data: {}, app_user_id: null };
  const step = async (m) => { sent = [];
    const res = await processMessage({ phone: '233244000000',
      message: typeof m === 'string' ? { type: 'text', text: m } : m, session, supabase });
    session.state = res.newState; session.collected_data = res.newData; return res; };

  await step('hi'); await step(LOC);
  check('location opens the Flow', () => {
    assert.strictEqual(session.state, STATES.AWAITING_FLOW);
    const f = sent.find(m => m.k === 'flow');
    assert.ok(f, 'no flow message sent');
    assert.strictEqual(f.payload.flowToken, 's1');
    assert.strictEqual(f.payload.screen, 'SCHEDULE');
    assert.ok(f.payload.data.min_date, 'min_date missing');
  });

  await step({ type: 'nfm_reply', flowResponse: GOOD });
  check('Flow completion produces a priced review', () => {
    assert.strictEqual(session.state, STATES.AWAITING_CONFIRMATION);
    const body = sent.find(m => m.k === 'btn').x;
    assert.ok(body.includes('TOTAL: GHS 61.00'), 'expected 2x120L = 60 + 1 fee\n' + body);
    assert.strictEqual(session.collected_data.bag_count, 2, 'bag_count not coerced to a number');
    assert.strictEqual(session.collected_data.bin_size_liters, 120);
  });

  await step('confirm_booking');
  check('confirming creates the bin and sends the QR', () => {
    assert.strictEqual(session.state, STATES.COMPLETED);
    assert.ok(sent.some(m => m.k === 'image'), 'no QR image');
  });

  console.log('fallbacks');
  const fresh = () => Object.assign(session, { state: STATES.IDLE, collected_data: {} });

  fresh(); await step('hi'); await step(LOC);
  await step({ type: 'nfm_reply', flowResponse: { ...GOOD, bin_size_liters: '999' } });
  check('unusable Flow payload falls back to chat', () =>
    assert.strictEqual(session.state, STATES.AWAITING_FREQUENCY));

  failFlow = true;
  fresh(); await step('hi'); await step(LOC);
  check('Flow send failure falls back to chat', () =>
    assert.strictEqual(session.state, STATES.AWAITING_FREQUENCY));
  failFlow = false;

  console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures above)' : ''}`);
})();
