/**
 * Netlify Function: whatsapp-notify
 * 
 * Sends outbound WhatsApp notifications when digital_bin status changes.
 * Triggered by Supabase Database Webhook on digital_bins UPDATE or manually via API.
 * 
 * Endpoint: POST /.netlify/functions/whatsapp-notify
 * 
 * Body format (Supabase webhook payload):
 * {
 *   "type": "UPDATE",
 *   "table": "digital_bins",
 *   "record": { ...new row },
 *   "old_record": { ...old row }
 * }
 * 
 * OR manual trigger:
 * {
 *   "digital_bin_id": "uuid",
 *   "status": "accepted",
 *   "collector_name": "Kwame"
 * }
 * 
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID
 *   WHATSAPP_ACCESS_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WHATSAPP_NOTIFY_SECRET - Shared secret for authenticating webhook calls
 */

const { createClient } = require('@supabase/supabase-js');
const { sendTextMessage } = require('./utils/whatsapp-api');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[WhatsApp Notify] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Status transition messages
const STATUS_MESSAGES = {
  available: (data) =>
    `Your collection request is now in the pool. A collector will be assigned shortly.`,

  accepted: (data) =>
    `Great news! A collector${data.collector_name ? ` (${data.collector_name})` : ''} has accepted your pickup.\n\n` +
    `They'll be heading your way soon.`,

  en_route: (data) =>
    `Your collector is on the way! Please ensure your bins are accessible.\n\n` +
    `Track in real-time on the app: https://trashdrops.app`,

  arrived: (data) =>
    `Your collector has arrived at your location.`,

  collecting: (data) =>
    `Collection in progress. Please allow a few minutes.`,

  completed: (data) =>
    `Collection complete!\n\n` +
    `Bins collected: ${data.bag_count || '?'}x ${data.bin_size_liters || '?'}L\n` +
    `Fee: GHS ${data.fee || '0'}\n\n` +
    `Thank you for using TrashDrop! Reply "1" to book another pickup.`,

  cancelled: (data) =>
    `Your booking has been cancelled. If this was unexpected, please reply "hi" to rebook or contact support.`,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Verify shared secret
  const authHeader = event.headers['x-webhook-secret'] || event.headers['authorization'];
  const expectedSecret = process.env.WHATSAPP_NOTIFY_SECRET;

  // Fail closed: an unset secret must never mean "no authentication"
  if (!expectedSecret) {
    console.error('[WhatsApp Notify] WHATSAPP_NOTIFY_SECRET not configured');
    return { statusCode: 500, body: 'Not configured' };
  }

  if (authHeader !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    console.warn('[WhatsApp Notify] Unauthorized request');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const supabase = getSupabaseClient();

    let digitalBin;
    let oldStatus;

    // Handle Supabase database webhook format
    if (body.type === 'UPDATE' && body.table === 'digital_bins') {
      digitalBin = body.record;
      oldStatus = body.old_record?.status;
    }
    // Handle manual trigger format
    else if (body.digital_bin_id) {
      const { data } = await supabase
        .from('digital_bins')
        .select('*')
        .eq('id', body.digital_bin_id)
        .single();
      digitalBin = data;
      oldStatus = body.old_status;
    } else {
      return { statusCode: 400, body: 'Invalid payload' };
    }

    if (!digitalBin) {
      return { statusCode: 404, body: 'Digital bin not found' };
    }

    const newStatus = digitalBin.status;

    // Skip if status hasn't changed
    if (oldStatus === newStatus) {
      return { statusCode: 200, body: 'No status change' };
    }

    // Find the WhatsApp phone number for this booking.
    // Bookings made over WhatsApp carry whatsapp_user_id even when they are
    // owned by the guest auth user, so prefer that over the owner lookup.
    let waPhone = null;

    if (digitalBin.whatsapp_user_id) {
      const { data } = await supabase
        .from('whatsapp_users')
        .select('phone')
        .eq('id', digitalBin.whatsapp_user_id)
        .single();
      waPhone = data?.phone || null;
    } else {
      const { data } = await supabase
        .from('whatsapp_users')
        .select('phone')
        .eq('user_id', digitalBin.user_id)
        .single();
      waPhone = data?.phone || null;
    }

    if (!waPhone) {
      // Not a WhatsApp booking and the owner has no linked number — nothing to send
      console.log(`[WhatsApp Notify] No WhatsApp user for bin=${digitalBin.id} (user_id=${digitalBin.user_id})`);
      return { statusCode: 200, body: 'No WhatsApp user' };
    }

    // Get message template for this status
    const messageFunc = STATUS_MESSAGES[newStatus];
    if (!messageFunc) {
      console.log(`[WhatsApp Notify] No message template for status: ${newStatus}`);
      return { statusCode: 200, body: 'No template for status' };
    }

    // Fetch collector name if applicable
    let collectorName = null;
    if (digitalBin.collector_id && ['accepted', 'en_route', 'arrived'].includes(newStatus)) {
      const { data: collector } = await supabase
        .from('collector_profiles')
        .select('first_name')
        .eq('user_id', digitalBin.collector_id)
        .single();
      collectorName = collector?.first_name || null;
    }

    // Build and send message
    const messageText = messageFunc({
      ...digitalBin,
      collector_name: collectorName,
    });

    await sendTextMessage(waPhone, messageText);
    console.log(`[WhatsApp Notify] Sent ${newStatus} notification to ${waPhone}`);

    return { statusCode: 200, body: 'Notification sent' };

  } catch (err) {
    console.error('[WhatsApp Notify] Error:', err);
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
