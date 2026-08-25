/**
 * WhatsApp Cloud API Client
 * Shared utility for sending messages via Meta's WhatsApp Business API
 * 
 * Required environment variables:
 * - WHATSAPP_PHONE_NUMBER_ID: Your WhatsApp Business phone number ID
 * - WHATSAPP_ACCESS_TOKEN: Permanent access token from Meta Business
 * - WHATSAPP_VERIFY_TOKEN: Webhook verification token (you define this)
 */

// Netlify Functions run on Node 18+, which has fetch built in.
const WHATSAPP_API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

/**
 * Credentials are read under the META_* names, falling back to the older
 * WHATSAPP_* ones so an environment that still uses those keeps working.
 *
 * The shape check is not pedantry: these four values are easy to paste into the
 * wrong box, and doing so fails far away from the cause. A WhatsApp access token
 * is a long "EAA…" string; an App Secret is 32 hex characters. Swapping them
 * gets you "Cannot parse access token" from Graph on the first send, and a
 * webhook that rejects every signature — neither of which points at the mix-up.
 */
function looksLikeAccessToken(v) {
  return typeof v === 'string' && v.startsWith('EAA') && v.length > 50;
}

function getConfig() {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('[WhatsApp API] Missing META_PHONE_NUMBER_ID or META_ACCESS_TOKEN');
  }

  if (!looksLikeAccessToken(accessToken)) {
    console.warn(
      '[WhatsApp API] META_ACCESS_TOKEN does not look like a WhatsApp access token ' +
      `(${accessToken.length} chars, does not start with "EAA"). A 32-character hex ` +
      'value is an App Secret, not a token — check the two are not swapped.'
    );
  }

  return {
    phoneNumberId,
    accessToken,
    verifyToken,
    // Booking Flow (whatsapp-flows/bin-pickup.flow.json). Unset -> the engine
    // falls back to asking the same questions message by message.
    flowId: process.env.WHATSAPP_FLOW_ID || null,
    // 'draft' lets an unpublished Flow be tested by its creator
    flowMode: (process.env.WHATSAPP_FLOW_MODE || 'published').toLowerCase(),
    // WhatsApp Business Account id — needed to create, update or publish Flows
    // through the Flows API, not to send messages
    wabaId: process.env.META_BUSINESS_ACCOUNT_ID || null,
  };
}

/**
 * Send a text message
 */
async function sendTextMessage(to, text) {
  const { phoneNumberId, accessToken } = getConfig();

  const response = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body: text },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('[WhatsApp API] Send text failed:', JSON.stringify(data));
    throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`);
  }
  return data;
}

/**
 * Send an interactive list message (up to 10 rows)
 */
async function sendListMessage(to, { headerText, bodyText, footerText, buttonText, sections }) {
  const { phoneNumberId, accessToken } = getConfig();

  const response = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: headerText ? { type: 'text', text: headerText } : undefined,
        body: { text: bodyText },
        footer: footerText ? { text: footerText } : undefined,
        action: {
          button: buttonText || 'Select',
          sections,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('[WhatsApp API] Send list failed:', JSON.stringify(data));
    throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`);
  }
  return data;
}

/**
 * Send interactive reply buttons (up to 3 buttons)
 */
async function sendButtonMessage(to, { bodyText, footerText, buttons }) {
  const { phoneNumberId, accessToken } = getConfig();

  const response = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        footer: footerText ? { text: footerText } : undefined,
        action: {
          buttons: buttons.map((btn, i) => ({
            type: 'reply',
            reply: { id: btn.id || `btn_${i}`, title: btn.title },
          })),
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('[WhatsApp API] Send buttons failed:', JSON.stringify(data));
    throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`);
  }
  return data;
}

/**
 * Send an interactive Flow message.
 *
 * `flowToken` is echoed back inside the completion payload and is the only way
 * to correlate a response with the conversation that opened it — the reply does
 * not carry the Flow id — so the session id is passed here.
 *
 * @param {string} to
 * @param {Object} opts
 * @param {string} opts.flowToken       correlation token echoed in response_json
 * @param {string} opts.screen          first screen id, e.g. 'SCHEDULE'
 * @param {Object} opts.data            screen data for that first screen
 * @param {string} [opts.headerText]
 * @param {string} opts.bodyText
 * @param {string} [opts.footerText]
 * @param {string} [opts.ctaText]       button label
 */
async function sendFlowMessage(to, { flowToken, screen, data, headerText, bodyText, footerText, ctaText }) {
  const { phoneNumberId, accessToken, flowId, flowMode } = getConfig();

  if (!flowId) throw new Error('[WhatsApp API] WHATSAPP_FLOW_ID is not configured');

  const parameters = {
    flow_message_version: '3',
    flow_token: flowToken,
    flow_id: flowId,
    flow_cta: ctaText || 'Continue',
    flow_action: 'navigate',
    flow_action_payload: { screen, data },
  };

  // Only send `mode` for drafts; published Flows reject it
  if (flowMode === 'draft') parameters.mode = 'draft';

  const response = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        ...(headerText ? { header: { type: 'text', text: headerText } } : {}),
        body: { text: bodyText },
        ...(footerText ? { footer: { text: footerText } } : {}),
        action: { name: 'flow', parameters },
      },
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    console.error('[WhatsApp API] Send flow failed:', JSON.stringify(result));
    throw new Error(`WhatsApp API error: ${result.error?.message || response.statusText}`);
  }
  return result;
}

/**
 * Upload a media file to WhatsApp and return its media id.
 * Sending by id avoids having to host the file on a public URL.
 */
async function uploadMedia(buffer, mimeType, filename) {
  const { phoneNumberId, accessToken } = getConfig();

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  // Content-Type is deliberately unset: fetch adds the multipart boundary
  const response = await fetch(`${BASE_URL}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: form,
  });

  const data = await response.json();
  if (!response.ok || !data.id) {
    console.error('[WhatsApp API] Media upload failed:', JSON.stringify(data));
    throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`);
  }
  return data.id;
}

/**
 * Send an image, either by uploaded media id or by public link
 */
async function sendImageMessage(to, { mediaId, link, caption }) {
  const { phoneNumberId, accessToken } = getConfig();

  const image = mediaId ? { id: mediaId } : { link };
  if (caption) image.caption = caption;

  const response = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('[WhatsApp API] Send image failed:', JSON.stringify(data));
    throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`);
  }
  return data;
}

/**
 * Mark a message as read (blue ticks)
 */
async function markAsRead(messageId) {
  const { phoneNumberId, accessToken } = getConfig();

  await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
}

/**
 * Extract message content from webhook payload
 * Returns normalized message object or null if not a user message
 */
function extractMessage(body) {
  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) return null;

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    const result = {
      messageId: message.id,
      from: message.from,                    // phone in E.164 without +
      timestamp: message.timestamp,
      profileName: contact?.profile?.name || null,
      type: message.type,                    // text, interactive, location, image, etc.
    };

    switch (message.type) {
      case 'text':
        result.text = message.text.body;
        break;
      case 'interactive':
        // A completed Flow arrives as interactive/nfm_reply. response_json is a
        // JSON *string* holding the Complete action's payload plus flow_token.
        if (message.interactive.type === 'nfm_reply') {
          result.type = 'nfm_reply';
          result.text = null;
          try {
            result.flowResponse = JSON.parse(message.interactive.nfm_reply.response_json || '{}');
          } catch (err) {
            console.error('[WhatsApp API] Could not parse flow response_json:', err.message);
            result.flowResponse = null;
          }
        } else if (message.interactive.type === 'list_reply') {
          result.text = message.interactive.list_reply.id;
          result.interactiveTitle = message.interactive.list_reply.title;
        } else if (message.interactive.type === 'button_reply') {
          result.text = message.interactive.button_reply.id;
          result.interactiveTitle = message.interactive.button_reply.title;
        }
        break;
      case 'location':
        result.location = {
          latitude: message.location.latitude,
          longitude: message.location.longitude,
          name: message.location.name || null,
          address: message.location.address || null,
        };
        break;
      default:
        result.text = null;
    }

    return result;
  } catch (err) {
    console.error('[WhatsApp API] Extract message error:', err.message);
    return null;
  }
}

module.exports = {
  getConfig,
  sendTextMessage,
  sendListMessage,
  sendButtonMessage,
  sendFlowMessage,
  sendImageMessage,
  uploadMedia,
  markAsRead,
  extractMessage,
};
