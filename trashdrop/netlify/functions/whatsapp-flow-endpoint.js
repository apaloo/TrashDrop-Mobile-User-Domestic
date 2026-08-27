/**
 * Netlify Function: WhatsApp Flow data-exchange endpoint
 * for "TrashDrop Digital Bin" (flow id 2122136435396715).
 *
 * ---------------------------------------------------------------------------
 * DORMANT BY DESIGN — nothing calls this today.
 * ---------------------------------------------------------------------------
 * A WhatsApp Flow only becomes endpoint-backed when its Flow JSON declares
 * `data_api_version`. Ours does not (whatsapp-flows/bin-pickup.flow.json is
 * plain `"version": "6.0"`), so Meta renders every screen client-side and never
 * calls out — no `ping`, no `INIT`, no `data_exchange`.
 *
 * Nor would `INIT` fire even if an endpoint URI were configured: the Flow is
 * launched with `flow_action: 'navigate'` and its first screen's data is handed
 * over at send time (utils/whatsapp-api.js → sendFlowMessage):
 *
 *     flow_action: 'navigate',
 *     flow_action_payload: { screen: 'SCHEDULE', data: { location_name, address, min_date } }
 *
 * `INIT` is how a *data_exchange*-launched Flow asks for that same data instead.
 *
 * The live screen graph is entirely client-side:
 *     SCHEDULE --navigate--> WASTE_DETAILS --navigate--> ADDITIONAL_INFO --complete-->
 * and `complete` delivers the submission to whatsapp-webhook.js as an
 * interactive `nfm_reply`, where it is already priced against `pricing_zones`
 * (utils/pricing.js → quoteBooking → find_nearest_pricing_zone) and confirmed
 * in chat. Pricing does NOT belong here.
 *
 * This file exists so the capability is ready and correct if the Flow is ever
 * upgraded to a data-exchange Flow. To actually switch it on you must:
 *   1. add `data_api_version` to bin-pickup.flow.json,
 *   2. add a `data_exchange` action to whichever screen needs a server round
 *      trip (e.g. showing a live price before ADDITIONAL_INFO completes),
 *   3. change sendFlowMessage's `flow_action` to 'data_exchange',
 *   4. set this function's URL as the Endpoint URI in WhatsApp Manager:
 *      https://trashdrop-mobile.windsurf.build/.netlify/functions/whatsapp-flow-endpoint
 * Until all four are done, leaving this deployed is harmless but inert.
 *
 * Env: FLOW_PRIVATE_KEY (already set on Netlify), optionally
 *      FLOW_PRIVATE_KEY_PASSPHRASE, plus the standard SUPABASE_* pair.
 */

const crypto = require('crypto');
const { getServiceClient } = require('./utils/supabase-admin');

const LOG_PREFIX = '[WhatsApp Flow Endpoint]';

function getPrivateKey() {
  const pem = process.env.FLOW_PRIVATE_KEY;
  if (!pem) throw new Error('FLOW_PRIVATE_KEY env var is not set');
  return crypto.createPrivateKey({
    key: pem,
    passphrase: process.env.FLOW_PRIVATE_KEY_PASSPHRASE || undefined,
  });
}

function decryptRequest(body) {
  const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body;
  const privateKey = getPrivateKey();

  const aesKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const TAG_LENGTH = 16;
  const encryptedBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const authTag = flowDataBuffer.subarray(-TAG_LENGTH);
  const iv = Buffer.from(initial_vector, 'base64');

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedBody), decipher.final()]);

  return { decryptedBody: JSON.parse(decrypted.toString('utf-8')), aesKey, iv };
}

function encryptResponse(responseObject, aesKey, iv) {
  // Meta's spec: respond under the same AES key with the IV bitwise-inverted
  const flippedIv = Buffer.from(iv.map((b) => b ^ 0xff));
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(responseObject), 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([encrypted, authTag]).toString('base64');
}

/**
 * Today in Accra, as YYYY-MM-DD.
 *
 * There is no booking cutoff anywhere in this system: the web form's date input
 * uses a plain `min={today}` with no time-of-day rule, and parsePickupDate() in
 * the conversation engine accepts "today" at any hour. So min-date is today,
 * not tomorrow — a stricter rule here would silently make WhatsApp bookings
 * refuse a same-day pickup the app happily accepts.
 *
 * Formatted through the zone rather than toISOString(), which is UTC and drifts
 * a day either side of midnight. Kept identical to conversation-engine.js's
 * todayInAccra() so the two launch paths cannot disagree.
 */
function todayInAccra() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Data for the SCHEDULE screen when a data-exchange Flow opens.
 *
 * location_name/address deliberately default to empty rather than being looked
 * up: they come from the WhatsApp location pin shared in the step before the
 * Flow opens, and the navigate path already passes them in flow_action_payload.
 * There is no saved-address table to read them from either — a customer is
 * whatsapp_users (keyed by `phone`), which holds no address.
 *
 * `flow_token` is the conversation session id (sendFlowMessage is called with
 * `flowToken: session.id`), NOT a phone number, so recovering the pin here
 * means session → whatsapp_sessions.collected_data. Done defensively: a failed
 * lookup degrades to blank fields, which the SCHEDULE screen lets the customer
 * fill in, rather than failing the Flow open.
 */
async function getInitScreenData(decryptedBody) {
  const base = { location_name: '', address: '', min_date: todayInAccra() };

  const sessionId = decryptedBody?.flow_token;
  if (!sessionId) return base;

  try {
    const supabase = getServiceClient(LOG_PREFIX);
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('collected_data')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const collected = data?.collected_data || {};
    return {
      location_name: String(collected.location_name || ''),
      address: String(collected.address || ''),
      min_date: base.min_date,
    };
  } catch (err) {
    console.warn(`${LOG_PREFIX} Could not load session ${sessionId}:`, err.message);
    return base;
  }
}

async function handleFlowRequest(decryptedBody) {
  const { action } = decryptedBody;

  if (action === 'ping') return { data: { status: 'active' } };

  if (action === 'INIT') {
    return { screen: 'SCHEDULE', data: await getInitScreenData(decryptedBody) };
  }

  // No screen uses data_exchange today (see the header). Anything else is a
  // Flow-side change that has not been mirrored here yet.
  throw new Error(`Unhandled action: ${action}`);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { decryptedBody, aesKey, iv } = decryptRequest(body);

    let responseObject;
    try {
      responseObject = await handleFlowRequest(decryptedBody);
    } catch (logicErr) {
      console.error(`${LOG_PREFIX} Flow logic error:`, logicErr);
      responseObject = { data: { error_msg: 'Something went wrong. Please try again.' } };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: encryptResponse(responseObject, aesKey, iv),
    };
  } catch (err) {
    // 421 tells Meta the request could not be decrypted, which is how it
    // detects a key mismatch during the endpoint health check
    console.error(`${LOG_PREFIX} Decryption failed:`, err);
    return { statusCode: 421, body: '' };
  }
};
