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

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('[WhatsApp API] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
  }

  return { phoneNumberId, accessToken, verifyToken };
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
        if (message.interactive.type === 'list_reply') {
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
  sendImageMessage,
  uploadMedia,
  markAsRead,
  extractMessage,
};
