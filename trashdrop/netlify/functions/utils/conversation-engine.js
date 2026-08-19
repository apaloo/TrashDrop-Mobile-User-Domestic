/**
 * Conversation Engine for WhatsApp Booking
 *
 * Mirrors the in-app "Request Bin Pickup (No Bag)" flow (src/pages/DigitalBin.js),
 * step for step, so a WhatsApp booking collects the same fields, in the same
 * order, with the same options and the same price as the web form:
 *
 *   Step 1  Bin Location      → share WhatsApp location
 *   Step 2  Schedule Details  → frequency, pickup date, preferred time
 *   Step 3  Waste Details     → number of bins, bin size, bin type, urgent
 *   Step 4  Additional Info   → notes
 *   Step 5  Review & Submit   → summary + fee breakdown, then confirm
 *
 * Photos (app step 4) are not collected here: they are uploaded to storage by
 * the app and are not part of the digital_bins row, so a WhatsApp booking
 * simply has none.
 *
 * Reply handling is state-scoped. Only CANCEL/STOP and BACK are global —
 * a bare "2" always means "the second option in the current step", never a
 * global shortcut.
 */

const QRCode = require('qrcode');
const {
  sendTextMessage,
  sendListMessage,
  sendButtonMessage,
  sendImageMessage,
  uploadMedia,
} = require('./whatsapp-api');
const {
  BIN_SIZES,
  getBinSizeLabel,
  getBinSizeLabelShort,
  formatCurrency,
  quoteBooking,
} = require('./pricing');

const STATES = {
  IDLE: 'idle',
  // Step 1 — Bin Location
  AWAITING_LOCATION: 'awaiting_location',
  // Step 2 — Schedule Details
  AWAITING_FREQUENCY: 'awaiting_frequency',
  AWAITING_START_DATE: 'awaiting_start_date',
  AWAITING_PREFERRED_TIME: 'awaiting_preferred_time',
  // Step 3 — Waste Details
  AWAITING_BIN_COUNT: 'awaiting_bin_count',
  AWAITING_BIN_SIZE: 'awaiting_bin_size',
  AWAITING_WASTE_TYPE: 'awaiting_waste_type',
  AWAITING_URGENT: 'awaiting_urgent',
  // Step 4 — Additional Info
  AWAITING_NOTES: 'awaiting_notes',
  // Step 5 — Review & Submit
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  COMPLETED: 'completed',
};

// Ordered flow — drives both "next step" and the global BACK command
const FLOW = [
  STATES.AWAITING_LOCATION,
  STATES.AWAITING_FREQUENCY,
  STATES.AWAITING_START_DATE,
  STATES.AWAITING_PREFERRED_TIME,
  STATES.AWAITING_BIN_COUNT,
  STATES.AWAITING_BIN_SIZE,
  STATES.AWAITING_WASTE_TYPE,
  STATES.AWAITING_URGENT,
  STATES.AWAITING_NOTES,
  STATES.AWAITING_CONFIRMATION,
];

// The app's step numbering, for the "Step n of 5" progress line
const STEP_NUMBERS = {
  [STATES.AWAITING_LOCATION]: 1,
  [STATES.AWAITING_FREQUENCY]: 2,
  [STATES.AWAITING_START_DATE]: 2,
  [STATES.AWAITING_PREFERRED_TIME]: 2,
  [STATES.AWAITING_BIN_COUNT]: 3,
  [STATES.AWAITING_BIN_SIZE]: 3,
  [STATES.AWAITING_WASTE_TYPE]: 3,
  [STATES.AWAITING_URGENT]: 3,
  [STATES.AWAITING_NOTES]: 4,
  [STATES.AWAITING_CONFIRMATION]: 5,
};

// WasteDetailsStep WASTE_TYPES (digital_bins CHECK constraint)
const WASTE_TYPES = {
  general: 'General Waste',
  recycling: 'Recycling',
  organic: 'Organic Waste',
};

// ScheduleDetailsStep frequency options
const FREQUENCIES = {
  'one-time': 'One-time',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
};

// ReviewStep.formatPreferredTime
const PREFERRED_TIMES = {
  morning: 'Morning (8am - 12pm)',
  afternoon: 'Afternoon (12pm - 4pm)',
  evening: 'Evening (4pm - 8pm)',
};

const MAX_BINS = 5; // WasteDetailsStep offers 1–5

// --- Small helpers ---------------------------------------------------------

function nextState(state) {
  const i = FLOW.indexOf(state);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : STATES.AWAITING_CONFIRMATION;
}

function prevState(state) {
  const i = FLOW.indexOf(state);
  return i > 0 ? FLOW[i - 1] : STATES.AWAITING_LOCATION;
}

function stepLabel(state) {
  const n = STEP_NUMBERS[state];
  return n ? `Step ${n} of 5` : '';
}

function toISODate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Parse a pickup date the way the app's date input constrains it:
 * today or later, never a past date.
 * Accepts "today", "tomorrow", YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY.
 */
function parsePickupDate(raw) {
  const text = (raw || '').trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let parsed = null;

  if (text === 'today') {
    parsed = new Date(today);
  } else if (text === 'tomorrow') {
    parsed = new Date(today);
    parsed.setDate(parsed.getDate() + 1);
  } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    parsed = new Date(y, m - 1, d);
  } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) {
    const [d, m, y] = text.split(/[/-]/).map(Number);
    parsed = new Date(y, m - 1, d);
  }

  if (!parsed || isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  if (parsed < today) return null;

  return toISODate(parsed);
}

// --- Prompts ---------------------------------------------------------------
// One prompt per state, so forward navigation and BACK both re-use it.

async function promptFor(state, phone, data) {
  const step = stepLabel(state);

  switch (state) {
    case STATES.AWAITING_LOCATION:
      await sendTextMessage(phone,
        `📍 *Bin Location* (${step})\n\n` +
        'Share the pickup location so a collector can find your bin:\n\n' +
        '1. Tap the *+* (attachment) icon\n' +
        '2. Choose *Location*\n' +
        '3. Send your current location, or pick a point on the map\n\n' +
        'Reply CANCEL to stop.'
      );
      return;

    case STATES.AWAITING_FREQUENCY:
      await sendListMessage(phone, {
        headerText: 'Schedule Details',
        bodyText: `🗓️ *Collection Frequency* (${step})\n\nHow often should we collect from this location?`,
        footerText: 'Reply BACK to change the location',
        buttonText: 'Choose frequency',
        sections: [{
          title: 'Frequency',
          rows: [
            { id: 'one-time', title: 'One-time', description: 'A single pickup' },
            { id: 'weekly', title: 'Weekly', description: 'Every week' },
            { id: 'biweekly', title: 'Bi-weekly', description: 'Every two weeks' },
            { id: 'monthly', title: 'Monthly', description: 'Once a month' },
          ],
        }],
      });
      return;

    case STATES.AWAITING_START_DATE: {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      await sendTextMessage(phone,
        `🗓️ *Pickup Date* (${step})\n\n` +
        'When should the first pickup happen?\n\n' +
        `Reply *TODAY*, *TOMORROW*, or a date like *${toISODate(tomorrow)}* or *${tomorrow.getDate()}/${tomorrow.getMonth() + 1}/${tomorrow.getFullYear()}*.\n\n` +
        'Past dates are not accepted. Reply BACK to change the frequency.'
      );
      return;
    }

    case STATES.AWAITING_PREFERRED_TIME:
      await sendButtonMessage(phone, {
        bodyText: `⏰ *Preferred Time* (${step})\n\nWhat time of day suits you best?`,
        footerText: 'Reply BACK to change the date',
        buttons: [
          { id: 'morning', title: 'Morning' },
          { id: 'afternoon', title: 'Afternoon' },
          { id: 'evening', title: 'Evening' },
        ],
      });
      return;

    case STATES.AWAITING_BIN_COUNT:
      await sendTextMessage(phone,
        `🗑️ *Number of Digital Bins* (${step})\n\n` +
        `How many bins do you need collected? Reply with a number from *1* to *${MAX_BINS}*.\n\n` +
        'Reply BACK to change the preferred time.'
      );
      return;

    case STATES.AWAITING_BIN_SIZE:
      await sendListMessage(phone, {
        headerText: 'Waste Details',
        bodyText:
          `📦 *Bin Size* (${step})\n\n` +
          `${data.bag_count} bin${data.bag_count > 1 ? 's' : ''} noted. What size are they?\n\n` +
          'Larger bins cost more but hold more waste.',
        footerText: 'Most homes use 120L',
        buttonText: 'Choose bin size',
        sections: [{
          title: 'Bin Sizes',
          rows: BIN_SIZES.map((size) => ({
            id: String(size),
            title: `${size}L`,
            description: getBinSizeLabel(size).split(' - ')[1],
          })),
        }],
      });
      return;

    case STATES.AWAITING_WASTE_TYPE:
      await sendListMessage(phone, {
        headerText: 'Waste Details',
        bodyText: `♻️ *Bin Type* (${step})\n\nWhich type matches your waste?`,
        footerText: 'Reply BACK to change the bin size',
        buttonText: 'Choose bin type',
        sections: [{
          title: 'Bin Types',
          rows: [
            { id: 'general', title: 'General Waste', description: 'Mixed household waste' },
            { id: 'recycling', title: 'Recycling', description: 'Plastics, paper, metal, glass' },
            { id: 'organic', title: 'Organic Waste', description: 'Food scraps, garden waste' },
          ],
        }],
      });
      return;

    case STATES.AWAITING_URGENT:
      await sendButtonMessage(phone, {
        bodyText:
          `⚡ *Urgent Pickup?* (${step})\n\n` +
          'Urgent requests are processed first and collected within 2 hours. ' +
          'They carry a 30% surcharge on the base price.',
        footerText: 'Reply BACK to change the bin type',
        buttons: [
          { id: 'urgent_no', title: 'No, standard' },
          { id: 'urgent_yes', title: 'Yes, urgent' },
        ],
      });
      return;

    case STATES.AWAITING_NOTES:
      await sendTextMessage(phone,
        `📝 *Additional Info* (${step})\n\n` +
        'Any special instructions for the collector? For example a landmark, gate code, or where the bin is kept.\n\n' +
        'Send your note, or reply *SKIP* if there is nothing to add.'
      );
      return;

    default:
      return;
  }
}

/**
 * Step 5 — Review & Submit. Prices the booking and shows the same summary and
 * fee breakdown as ReviewStep, then asks for confirmation.
 */
async function promptReview(phone, data, supabase, session) {
  const quote = await quoteBooking(supabase, {
    bin_size_liters: data.bin_size_liters,
    bag_count: data.bag_count,
    is_urgent: data.is_urgent,
    latitude: data.latitude,
    longitude: data.longitude,
    user_id: session.app_user_id || null,
  });

  const lines = [
    '*Review & Submit* (Step 5 of 5)',
    '',
    '*Bin Location*',
    `${data.location_name}`,
    `${data.address}`,
    '',
    '*Schedule*',
    `Frequency: ${FREQUENCIES[data.frequency] || data.frequency}`,
    `Pickup date: ${data.start_date}`,
  ];

  // ReviewStep hides the time window on urgent requests
  if (!data.is_urgent) {
    lines.push(`Preferred time: ${PREFERRED_TIMES[data.preferred_time] || data.preferred_time}`);
  }

  lines.push(
    '',
    '*Waste Details*',
    `Bins: ${data.bag_count} Bin${data.bag_count > 1 ? 's' : ''}`,
    `Bin size: ${getBinSizeLabelShort(data.bin_size_liters)}`,
    `Bin type: ${WASTE_TYPES[data.waste_type]}`
  );

  if (data.is_urgent) lines.push('⚡ Urgent pickup (within 2 hours)');
  if (data.notes) lines.push('', '*Notes*', data.notes);

  lines.push('', '*Estimated Cost*');

  if (quote.pricing_source === 'gps' && quote.pricing_zone) {
    const area = quote.pricing_zone.suburb || quote.pricing_zone.community;
    if (area) lines.push(`📍 Location-based pricing for ${area}`);
  }

  if (quote.is_promotional) {
    lines.push(
      `🎁 Promotional pricing applied (request ${quote.promo_request_number} of ${quote.promo_max_requests})`,
      `${getBinSizeLabelShort(data.bin_size_liters)} promotional rate: ${formatCurrency(quote.total)}`,
      `Standard price: ${formatCurrency(quote.standard_total)}`,
      '',
      `*TOTAL: ${formatCurrency(quote.total)}*`,
      '',
      '🎁 Promotional flat rate — no additional charges.'
    );
  } else {
    lines.push(
      `Base (${getBinSizeLabelShort(data.bin_size_liters)} × ${data.bag_count}): ${formatCurrency(quote.base)}`
    );
    if (quote.urgent_charge > 0) {
      lines.push(`Urgent surcharge (30%): ${formatCurrency(quote.urgent_charge)}`);
    }
    lines.push(
      `Request fee: ${formatCurrency(quote.request_fee)}`,
      '',
      `*TOTAL: ${formatCurrency(quote.total)}*`,
      '',
      '⚠️ Estimate only. Final price calculated at confirmation.'
    );
  }

  lines.push('', 'Payment: pay on collection (Mobile Money or Cash).');

  await sendButtonMessage(phone, {
    bodyText: lines.join('\n'),
    footerText: 'Reply BACK to edit, or CANCEL to stop',
    buttons: [
      { id: 'confirm_booking', title: 'Confirm' },
      { id: 'back', title: 'Back' },
      { id: 'cancel_booking', title: 'Cancel' },
    ],
  });

  return { ...data, quote };
}

/**
 * Advance to a state and send its prompt. Review is special-cased because it
 * has to price the booking first.
 */
async function goTo(state, phone, data, supabase, session) {
  if (state === STATES.AWAITING_CONFIRMATION) {
    const newData = await promptReview(phone, data, supabase, session);
    return { newState: state, newData, done: true };
  }

  await promptFor(state, phone, data);
  return { newState: state, newData: data, done: true };
}

// --- Entry point -----------------------------------------------------------

/**
 * Process an incoming message and determine the next action.
 * @returns {Object} { newState, newData, done }
 */
async function processMessage({ phone, message, session, supabase }) {
  const { state, collected_data } = session;
  const data = collected_data || {};
  const text = (message.text || '').trim().toLowerCase();

  // Global commands. Deliberately short: numeric replies belong to the
  // current step, never to a global menu.
  if (text === 'cancel' || text === 'stop' || text === 'cancel_booking') {
    await sendTextMessage(phone, 'Booking cancelled. Send "hi" anytime to start again.');
    return { newState: STATES.IDLE, newData: {}, done: true };
  }

  if ((text === 'back' || text === 'previous') && FLOW.includes(state)) {
    if (state === STATES.AWAITING_LOCATION) {
      await sendTextMessage(phone, 'You are at the first step. Share your location to continue, or reply CANCEL to stop.');
      return { newState: state, newData: data, done: true };
    }
    return await goTo(prevState(state), phone, data, supabase, session);
  }

  switch (state) {
    case STATES.AWAITING_LOCATION:
      return await handleLocation(phone, message, data, supabase, session);

    case STATES.AWAITING_FREQUENCY:
      return await handleFrequency(phone, text, data, supabase, session);

    case STATES.AWAITING_START_DATE:
      return await handleStartDate(phone, message, data, supabase, session);

    case STATES.AWAITING_PREFERRED_TIME:
      return await handlePreferredTime(phone, text, data, supabase, session);

    case STATES.AWAITING_BIN_COUNT:
      return await handleBinCount(phone, text, data, supabase, session);

    case STATES.AWAITING_BIN_SIZE:
      return await handleBinSize(phone, text, data, supabase, session);

    case STATES.AWAITING_WASTE_TYPE:
      return await handleWasteType(phone, text, data, supabase, session);

    case STATES.AWAITING_URGENT:
      return await handleUrgent(phone, text, data, supabase, session);

    case STATES.AWAITING_NOTES:
      return await handleNotes(phone, message, data, supabase, session);

    case STATES.AWAITING_CONFIRMATION:
      return await handleConfirmation(phone, text, data, supabase, session);

    case STATES.IDLE:
    default:
      return await handleIdle(phone, text, supabase, session);
  }
}

// --- State handlers --------------------------------------------------------

async function handleIdle(phone, text, supabase, session) {
  if (text === 'status' || text === 'bookings') {
    await handleStatusRequest(phone, supabase, session);
    return { newState: STATES.IDLE, newData: {}, done: true };
  }

  if (text === 'price' || text === 'pricing' || text === 'prices') {
    await sendTextMessage(phone,
      '*TrashDrop Pricing*\n\n' +
      'Base rates per bin (standard, non-urgent):\n' +
      '120L Standard: from GHS 30\n' +
      '240L Large: from GHS 40\n' +
      '360L Extra Large: from GHS 60\n\n' +
      'A GHS 1 request fee is added per pickup, and urgent pickups add 30%. ' +
      'Your exact price depends on your location and is shown before you confirm.\n\n' +
      'Send *BOOK* to request a bin pickup.'
    );
    return { newState: STATES.IDLE, newData: {}, done: true };
  }

  // Anything else starts the booking flow at step 1
  await sendTextMessage(phone,
    '👋 Welcome to *TrashDrop*!\n\n' +
    "Let's set up a bin pickup — the same 5 steps as the app:\n" +
    '1. Bin location\n2. Schedule\n3. Waste details\n4. Additional info\n5. Review & submit\n\n' +
    'Reply BACK at any point to change an answer, or CANCEL to stop. ' +
    'Send *STATUS* to see your existing bookings.'
  );

  return await goTo(STATES.AWAITING_LOCATION, phone, {}, supabase, session);
}

// Step 1 — Bin Location
async function handleLocation(phone, message, data, supabase, session) {
  if (message.type !== 'location' || !message.location) {
    await sendTextMessage(phone,
      'I need a pinned location to book a pickup — collectors need a precise point.\n\n' +
      '1. Tap the *+* (attachment) icon\n' +
      '2. Choose *Location*\n' +
      '3. Send your current location, or pick a point on the map'
    );
    return { newState: STATES.AWAITING_LOCATION, newData: data, done: true };
  }

  const { latitude, longitude, name, address } = message.location;

  const newData = {
    ...data,
    latitude,
    longitude,
    location_name: name || address || 'My Location',
    address: address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
  };

  await sendTextMessage(phone, `📍 Location saved: ${newData.location_name}`);
  return await goTo(STATES.AWAITING_FREQUENCY, phone, newData, supabase, session);
}

// Step 2 — Schedule Details
async function handleFrequency(phone, text, data, supabase, session) {
  const byNumber = { 1: 'one-time', 2: 'weekly', 3: 'biweekly', 4: 'monthly' };
  let frequency = null;

  if (FREQUENCIES[text]) {
    frequency = text;
  } else if (byNumber[text]) {
    frequency = byNumber[text];
  } else if (text.includes('one') || text.includes('once') || text.includes('single')) {
    frequency = 'one-time';
  } else if (text.includes('biweek') || text.includes('bi-week') || text.includes('fortnight')) {
    frequency = 'biweekly';
  } else if (text.includes('week')) {
    frequency = 'weekly';
  } else if (text.includes('month')) {
    frequency = 'monthly';
  }

  if (!frequency) {
    await sendTextMessage(phone,
      'Please pick a frequency from the list, or reply:\n1 - One-time\n2 - Weekly\n3 - Bi-weekly\n4 - Monthly'
    );
    return { newState: STATES.AWAITING_FREQUENCY, newData: data, done: true };
  }

  return await goTo(STATES.AWAITING_START_DATE, phone, { ...data, frequency }, supabase, session);
}

async function handleStartDate(phone, message, data, supabase, session) {
  const startDate = parsePickupDate(message.text);

  if (!startDate) {
    await sendTextMessage(phone,
      "I couldn't read that as an upcoming date.\n\n" +
      'Reply *TODAY*, *TOMORROW*, or a date like *2026-08-21* or *21/08/2026*. Past dates are not accepted.'
    );
    return { newState: STATES.AWAITING_START_DATE, newData: data, done: true };
  }

  return await goTo(STATES.AWAITING_PREFERRED_TIME, phone, { ...data, start_date: startDate }, supabase, session);
}

async function handlePreferredTime(phone, text, data, supabase, session) {
  const byNumber = { 1: 'morning', 2: 'afternoon', 3: 'evening' };
  let preferredTime = null;

  if (PREFERRED_TIMES[text]) {
    preferredTime = text;
  } else if (byNumber[text]) {
    preferredTime = byNumber[text];
  } else if (text.includes('morning')) {
    preferredTime = 'morning';
  } else if (text.includes('afternoon')) {
    preferredTime = 'afternoon';
  } else if (text.includes('evening')) {
    preferredTime = 'evening';
  }

  if (!preferredTime) {
    await sendTextMessage(phone,
      'Please choose a time window, or reply:\n1 - Morning (8am - 12pm)\n2 - Afternoon (12pm - 4pm)\n3 - Evening (4pm - 8pm)'
    );
    return { newState: STATES.AWAITING_PREFERRED_TIME, newData: data, done: true };
  }

  return await goTo(STATES.AWAITING_BIN_COUNT, phone, { ...data, preferred_time: preferredTime }, supabase, session);
}

// Step 3 — Waste Details
async function handleBinCount(phone, text, data, supabase, session) {
  const count = parseInt(text, 10);

  if (isNaN(count) || count < 1 || count > MAX_BINS) {
    await sendTextMessage(phone, `Please reply with a number between 1 and ${MAX_BINS}.`);
    return { newState: STATES.AWAITING_BIN_COUNT, newData: data, done: true };
  }

  return await goTo(STATES.AWAITING_BIN_SIZE, phone, { ...data, bag_count: count }, supabase, session);
}

async function handleBinSize(phone, text, data, supabase, session) {
  const sizeMatch = text.match(/(\d+)/);
  const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null;

  if (!size || !BIN_SIZES.includes(size)) {
    await sendTextMessage(phone,
      'Please pick a bin size from the list, or reply with one of:\n' + BIN_SIZES.join(', ') + ' (litres)'
    );
    return { newState: STATES.AWAITING_BIN_SIZE, newData: data, done: true };
  }

  return await goTo(STATES.AWAITING_WASTE_TYPE, phone, { ...data, bin_size_liters: size }, supabase, session);
}

async function handleWasteType(phone, text, data, supabase, session) {
  const byNumber = { 1: 'general', 2: 'recycling', 3: 'organic' };
  let wasteType = null;

  if (WASTE_TYPES[text]) {
    wasteType = text;
  } else if (byNumber[text]) {
    wasteType = byNumber[text];
  } else if (text.includes('general') || text.includes('mixed')) {
    wasteType = 'general';
  } else if (text.includes('recycl')) {
    wasteType = 'recycling';
  } else if (text.includes('organic') || text.includes('food') || text.includes('garden')) {
    wasteType = 'organic';
  }

  if (!wasteType) {
    await sendTextMessage(phone,
      'Please pick a bin type from the list, or reply:\n1 - General Waste\n2 - Recycling\n3 - Organic Waste'
    );
    return { newState: STATES.AWAITING_WASTE_TYPE, newData: data, done: true };
  }

  return await goTo(STATES.AWAITING_URGENT, phone, { ...data, waste_type: wasteType }, supabase, session);
}

async function handleUrgent(phone, text, data, supabase, session) {
  let isUrgent = null;

  // Check the negative first: the "urgent_no" button id also contains "urgent"
  if (['urgent_no', 'no', 'n', '2'].includes(text) || text.includes('standard')) {
    isUrgent = false;
  } else if (['urgent_yes', 'yes', 'y', '1'].includes(text) || text.includes('urgent')) {
    isUrgent = true;
  }

  if (isUrgent === null) {
    await sendTextMessage(phone, 'Please reply *YES* for an urgent pickup or *NO* for a standard one.');
    return { newState: STATES.AWAITING_URGENT, newData: data, done: true };
  }

  return await goTo(STATES.AWAITING_NOTES, phone, { ...data, is_urgent: isUrgent }, supabase, session);
}

// Step 4 — Additional Info
async function handleNotes(phone, message, data, supabase, session) {
  const raw = (message.text || '').trim();
  const lower = raw.toLowerCase();

  if (message.type === 'image') {
    await sendTextMessage(phone,
      'Thanks — photos can only be attached from the TrashDrop app, so I cannot save this one. ' +
      'Please describe anything the collector should know, or reply *SKIP*.'
    );
    return { newState: STATES.AWAITING_NOTES, newData: data, done: true };
  }

  const skip = ['skip', 'none', 'no', 'n/a', 'nothing', '-'].includes(lower);
  const notes = skip || !raw ? null : raw.slice(0, 500);

  return await goTo(STATES.AWAITING_CONFIRMATION, phone, { ...data, notes }, supabase, session);
}

// Step 5 — Review & Submit
async function handleConfirmation(phone, text, data, supabase, session) {
  const confirmed = ['confirm_booking', 'confirm', 'yes', 'y', 'submit'].includes(text);

  if (!confirmed) {
    await sendButtonMessage(phone, {
      bodyText: 'Please confirm the booking, go BACK to edit it, or cancel.',
      buttons: [
        { id: 'confirm_booking', title: 'Confirm' },
        { id: 'back', title: 'Back' },
        { id: 'cancel_booking', title: 'Cancel' },
      ],
    });
    return { newState: STATES.AWAITING_CONFIRMATION, newData: data, done: true };
  }

  // Re-price at submit time so the stored fee reflects current pricing,
  // exactly as the app re-runs the breakdown in handleSubmit.
  let quote;
  try {
    quote = await quoteBooking(supabase, {
      bin_size_liters: data.bin_size_liters,
      bag_count: data.bag_count,
      is_urgent: data.is_urgent,
      latitude: data.latitude,
      longitude: data.longitude,
      user_id: session.app_user_id || null,
    });
  } catch (err) {
    console.error('[Conversation] Re-quote failed, using reviewed quote:', err.message);
    quote = data.quote;
  }

  if (!quote) {
    await sendTextMessage(phone, 'Sorry, I could not price this booking. Please send "hi" to start again.');
    return { newState: STATES.IDLE, newData: {}, done: true };
  }

  // digital_bins has no column for the requested date or time window, so they
  // ride along with the notes in the details text — same as the app.
  const schedulePreference = [
    data.start_date ? `Preferred date: ${data.start_date}` : null,
    !data.is_urgent && data.preferred_time
      ? `Preferred time: ${PREFERRED_TIMES[data.preferred_time] || data.preferred_time}`
      : null,
  ].filter(Boolean).join(' • ');

  const details = [schedulePreference, data.notes].filter(Boolean).join('\n') || null;

  try {
    const { data: binId, error } = await supabase.rpc('create_whatsapp_digital_bin', {
      p_whatsapp_user_id: session.whatsapp_user_id,
      p_location_name: data.location_name || 'WhatsApp Location',
      p_address: data.address || '',
      p_latitude: data.latitude,
      p_longitude: data.longitude,
      p_fee_total: quote.total,
      p_waste_type: data.waste_type || 'general',
      p_bin_size_liters: data.bin_size_liters || 120,
      p_bag_count: data.bag_count || 1,
      p_frequency: data.frequency || 'one-time',
      p_is_urgent: data.is_urgent || false,
      p_details: details,
      p_is_promotional: quote.is_promotional,
      p_promo_request_number: quote.promo_request_number,
      p_collector_core_payout: quote.collector_core_payout,
      p_collector_urgent_payout: quote.collector_urgent_payout,
      p_collector_total_payout: quote.collector_total_payout,
    });

    if (error) {
      console.error('[Conversation] Create bin error:', error);
      await sendTextMessage(phone,
        'Sorry, there was an error creating your booking. Please try again in a moment, or reply "hi" to restart.'
      );
      return { newState: STATES.IDLE, newData: {}, done: true };
    }

    const confirmation = [
      '✅ *Booking confirmed!*',
      '',
      `Location: ${data.location_name}`,
      `Frequency: ${FREQUENCIES[data.frequency] || data.frequency}`,
      `Pickup date: ${data.start_date}`,
    ];

    if (!data.is_urgent) {
      confirmation.push(`Preferred time: ${PREFERRED_TIMES[data.preferred_time] || data.preferred_time}`);
    } else {
      confirmation.push('⚡ Urgent — collection within 2 hours');
    }

    confirmation.push(
      `Bins: ${data.bag_count} × ${getBinSizeLabelShort(data.bin_size_liters)} ${WASTE_TYPES[data.waste_type]}`,
      `Total: ${formatCurrency(quote.total)}`,
      '',
      "A collector will be assigned shortly and you'll get updates right here.",
      '',
      'Send *STATUS* anytime to check your bookings.',
      'Get live tracking and photo uploads in the app: https://trashdrops.app'
    );

    await sendTextMessage(phone, confirmation.join('\n'));

    // Same artefact the app produces on completion, delivered in-chat
    await sendBinQrCode(phone, binId, supabase);

    return {
      newState: STATES.COMPLETED,
      newData: { ...data, digital_bin_id: binId, quote },
      done: true,
    };
  } catch (err) {
    console.error('[Conversation] Booking creation failed:', err);
    await sendTextMessage(phone, 'Sorry, something went wrong. Please try again by sending "hi".');
    return { newState: STATES.IDLE, newData: {}, done: true };
  }
}

/**
 * Deliver the bin's QR code.
 *
 * The app renders this client-side from `qrcode` and keeps it in the Scheduled
 * QR tab; a WhatsApp customer has no app to render it in, so the same code is
 * generated server-side and sent as an image. The encoded value is read back
 * from `digital_bins.qr_code_url` rather than rebuilt here, so the QR can never
 * drift from the row the collector resolves.
 *
 * Never throws: a booking is already committed by the time this runs, so a QR
 * failure degrades to sending the link as text.
 */
async function sendBinQrCode(phone, binId, supabase) {
  let qrValue = null;

  try {
    const { data } = await supabase
      .from('digital_bins')
      .select('qr_code_url')
      .eq('id', binId)
      .single();
    qrValue = data?.qr_code_url || null;
  } catch (err) {
    console.error('[Conversation] QR lookup failed:', err.message);
  }

  if (!qrValue) {
    console.warn(`[Conversation] No qr_code_url for bin ${binId} — skipping QR`);
    return;
  }

  const caption =
    '📱 *Your digital bin QR code*\n\n' +
    'Save this image and show it to the collector, or print it and attach it to your bin. ' +
    'They scan it to confirm the pickup.';

  try {
    const png = await QRCode.toBuffer(qrValue, {
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    const mediaId = await uploadMedia(png, 'image/png', `bin-qr-${binId}.png`);
    await sendImageMessage(phone, { mediaId, caption });
  } catch (err) {
    console.error('[Conversation] QR image delivery failed, falling back to link:', err.message);
    await sendTextMessage(phone, `${caption}\n\n${qrValue}`).catch(() => {});
  }
}

/**
 * STATUS — works for guest bookings (matched by whatsapp_user_id) as well as
 * bookings owned by a linked app account.
 */
async function handleStatusRequest(phone, supabase, session) {
  try {
    const { data: waUser } = await supabase
      .from('whatsapp_users')
      .select('id, user_id')
      .eq('id', session.whatsapp_user_id)
      .single();

    const waUserId = waUser?.id || session.whatsapp_user_id;
    const orFilter = waUser?.user_id
      ? `whatsapp_user_id.eq.${waUserId},user_id.eq.${waUser.user_id}`
      : `whatsapp_user_id.eq.${waUserId}`;

    const { data: bins } = await supabase
      .from('digital_bins')
      .select('id, status, waste_type, bin_size_liters, bag_count, fee, is_urgent, created_at')
      .or(orFilter)
      .in('status', ['pending', 'available', 'accepted', 'en_route', 'arrived', 'collecting'])
      .order('created_at', { ascending: false })
      .limit(3);

    if (!bins || bins.length === 0) {
      await sendTextMessage(phone, 'You have no active bookings. Send "hi" to book a collection!');
      return;
    }

    const statusEmoji = {
      pending: '🕐', available: '📋', accepted: '✅',
      en_route: '🚛', arrived: '📍', collecting: '♻️',
    };

    let msg = '*Your active bookings:*\n\n';
    bins.forEach((bin, i) => {
      const emoji = statusEmoji[bin.status] || '📦';
      msg += `${i + 1}. ${emoji} ${bin.bag_count} × ${getBinSizeLabelShort(bin.bin_size_liters)} ` +
             `${WASTE_TYPES[bin.waste_type] || bin.waste_type}${bin.is_urgent ? ' ⚡' : ''}\n`;
      msg += `   Status: ${String(bin.status).replace(/_/g, ' ')}\n`;
      msg += `   Fee: ${formatCurrency(bin.fee)}\n\n`;
    });

    msg += 'Send *BOOK* to request another collection.';
    await sendTextMessage(phone, msg);
  } catch (err) {
    console.error('[Conversation] Status check error:', err);
    await sendTextMessage(phone, 'Could not check status right now. Please try again later.');
  }
}

module.exports = {
  processMessage,
  STATES,
  FLOW,
};
