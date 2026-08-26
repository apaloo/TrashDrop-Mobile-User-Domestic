/**
 * Netlify Function: whatsapp-webhook
 * 
 * Handles incoming WhatsApp messages via Meta Cloud API webhook.
 * Processes booking intents and manages conversational state using digital_bins.
 * 
 * Endpoints:
 *   GET  /.netlify/functions/whatsapp-webhook  → Webhook verification (Meta handshake)
 *   POST /.netlify/functions/whatsapp-webhook  → Incoming message processing
 * 
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID  - Meta Business phone number ID
 *   WHATSAPP_ACCESS_TOKEN     - Permanent system user access token
 *   WHATSAPP_VERIFY_TOKEN     - Your chosen verification string
 *   META_APP_SECRET           - Meta app secret, for X-Hub-Signature-256 checks
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_ROLE     - Supabase service role key (NOT the anon key)
 */

const crypto = require('crypto');
const { getServiceClient } = require('./utils/supabase-admin');
const { getConfig, extractMessage, markAsRead } = require('./utils/whatsapp-api');
const { processMessage, STATES } = require('./utils/conversation-engine');

/**
 * Meta signs every webhook POST with HMAC-SHA256 over the exact raw body.
 * Parse nothing until the signature checks out.
 */
function getRawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
}

function isValidSignature(event, rawBody) {
  const appSecret = process.env.META_APP_SECRET;
  const headers = event.headers || {};
  const signature = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];

  if (!appSecret) {
    console.error('[WhatsApp Webhook] META_APP_SECRET not configured — rejecting');
    return false;
  }
  if (!signature) return false;

  const expected = 'sha256=' +
    crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  const received = Buffer.from(signature);
  const digest = Buffer.from(expected);

  return received.length === digest.length && crypto.timingSafeEqual(received, digest);
}

// Rate limiting: simple in-memory store (resets on cold start)
const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // max messages per minute per phone

function isRateLimited(phone) {
  const now = Date.now();
  const entry = rateLimits.get(phone);

  if (!entry || (now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(phone, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

function getSupabaseClient() {
  return getServiceClient('[WhatsApp Webhook]');
}

exports.handler = async (event) => {
  // --- GET: Webhook verification handshake ---
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];

    const { verifyToken } = getConfig();

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp Webhook] Verification successful');
      return {
        statusCode: 200,
        body: challenge,
      };
    }

    return { statusCode: 403, body: 'Verification failed' };
  }

  // --- POST: Incoming message ---
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Meta expects 200 quickly; process async if possible
  try {
    const rawBody = getRawBody(event);
    if (!isValidSignature(event, rawBody)) {
      console.warn('[WhatsApp Webhook] Invalid signature — rejecting');
      return { statusCode: 401, body: 'Invalid signature' };
    }

    const body = JSON.parse(rawBody || '{}');

    // Extract message from webhook payload
    const message = extractMessage(body);
    if (!message) {
      // Not a user message (could be status update, etc.) — acknowledge
      return { statusCode: 200, body: 'OK' };
    }

    const phone = message.from;
    console.log(`[WhatsApp Webhook] Message from ${phone}: type=${message.type}, text="${message.text || ''}"`)

    // Rate limit check
    if (isRateLimited(phone)) {
      console.warn(`[WhatsApp Webhook] Rate limited: ${phone}`);
      return { statusCode: 200, body: 'OK' };
    }

    // Initialize Supabase
    const supabase = getSupabaseClient();

    // Idempotency: Meta redelivers messages, so process each id exactly once
    const { data: isNew, error: dedupeErr } = await supabase.rpc('record_whatsapp_message', {
      p_message_id: message.messageId,
      p_phone: phone,
    });

    if (dedupeErr) {
      console.error('[WhatsApp Webhook] Dedupe check failed:', dedupeErr);
      return { statusCode: 200, body: 'OK' };
    }
    if (isNew === false) {
      console.log(`[WhatsApp Webhook] Duplicate message ${message.messageId} — skipping`);
      return { statusCode: 200, body: 'OK' };
    }

    // Mark as read (blue ticks) — awaited so the call is not dropped when the
    // function freezes at the end of the invocation
    await markAsRead(message.messageId).catch(() => {});

    // Get or create active session
    const { data: sessionRows, error: sessionErr } = await supabase
      .rpc('get_active_whatsapp_session', { p_phone: phone });

    if (sessionErr || !sessionRows?.length) {
      console.error('[WhatsApp Webhook] Session error:', sessionErr);
      return { statusCode: 200, body: 'OK' };
    }

    const sessionRow = sessionRows[0];
    const session = {
      id: sessionRow.session_id,
      whatsapp_user_id: sessionRow.whatsapp_user_id,
      state: sessionRow.state,
      collected_data: sessionRow.collected_data || {},
      app_user_id: null,
    };

    // A linked app account unlocks the same promotional pricing as in the app
    const { data: waUser } = await supabase
      .from('whatsapp_users')
      .select('user_id')
      .eq('id', session.whatsapp_user_id)
      .single();
    session.app_user_id = waUser?.user_id || null;

    // Update display name if available
    if (message.profileName) {
      await supabase
        .from('whatsapp_users')
        .update({ display_name: message.profileName, updated_at: new Date().toISOString() })
        .eq('id', session.whatsapp_user_id);
    }

    // Process through conversation engine
    const result = await processMessage({
      phone,
      message,
      session,
      supabase,
    });

    // Persist new state unconditionally — this also refreshes the session
    // expiry, which a re-prompt in the same state still needs
    await supabase.rpc('update_whatsapp_session', {
      p_session_id: session.id,
      p_state: result.newState,
      p_collected_data: result.newData,
    });

    // If completed, reset session to idle for next booking
    if (result.newState === STATES.COMPLETED) {
      await supabase.rpc('update_whatsapp_session', {
        p_session_id: session.id,
        p_state: STATES.IDLE,
        p_collected_data: {},
      });
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('[WhatsApp Webhook] Unhandled error:', err);
    // Always return 200 to Meta to avoid retries
    return { statusCode: 200, body: 'OK' };
  }
};
