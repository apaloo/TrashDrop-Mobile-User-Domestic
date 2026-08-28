# WhatsApp Flow — Bin pickup request

`bin-pickup.flow.json` is a WhatsApp Flow that collects a digital bin booking as a
native in-app form, as an alternative to the message-by-message conversation in
`netlify/functions/utils/conversation-engine.js`.

It mirrors the in-app **Request Bin Pickup (No Bag)** form (`src/pages/DigitalBin.js`):

| App step | Flow screen |
| --- | --- |
| 1. Bin Location | *not in the Flow* — see below |
| 2. Schedule Details | `SCHEDULE` — frequency, pickup date, preferred time |
| 3. Waste Details | `WASTE_DETAILS` — bin count, size, type, urgent |
| 4. Additional Info | `ADDITIONAL_INFO` — notes |
| 5. Review & Submit | *not in the Flow* — see below |

## Two steps deliberately stay in the chat

**Location.** Flow JSON has no map or location-picker component. A collector needs a
precise pin, so the location still comes from a native WhatsApp location message
before the Flow is sent. Its name and address are passed into the Flow and shown
read-only at the top of `SCHEDULE`, so the customer can see what they are booking
against.

**Price and confirmation.** Showing a price inside the Flow would require a Flow Data
Endpoint — a public HTTPS endpoint with an RSA key pair and AES-GCM request/response
encryption — because the fee depends on selections made inside the Flow. This Flow
uses `complete` instead, with no endpoint at all: it returns the collected fields to
the webhook, which prices the booking with `utils/pricing.js` and asks for
confirmation in the chat exactly as it does today. That keeps the quote-before-commit
property without any new infrastructure.

If a price inside the Flow is wanted later, change the `ADDITIONAL_INFO` footer
action from `complete` to `data_exchange`, add a `REVIEW` screen, and implement the
encrypted endpoint.

## Launch payload

Send the Flow with these three values, which `SCHEDULE` declares as screen data:

```json
{
  "location_name": "Osu Home",
  "address": "12 Oxford St, Osu",
  "min_date": "2026-08-19"
}
```

`min_date` blocks past dates the way the web form's date input does

## Photos

`ADDITIONAL_INFO` carries a `PhotoPicker` (`bin_photos`), mirroring the app's
`AdditionalInfoStep`: camera only, 1–3 photos, 5 MB each.

`photo-source` MUST stay `"camera"`. Meta's default is `"camera_gallery"`, so
omitting it silently allows gallery uploads. `"camera"` means the WhatsApp client
offers no gallery option at all, which is what makes camera-only real rather than
advisory. This is also why chat attachments are refused in
`conversation-engine.js` — a chat image has no such guarantee, and accepting one
would reopen the gallery route the picker closes. Meta allows a
PhotoPicker in a `complete` payload, so this needs no Flow endpoint — the
completion webhook receives `{ file_name, mime_type, sha256, id }` per photo and
`conversation-engine.js` downloads each `id` after the booking is committed,
into the same `dumping-photos` bucket the app writes to.

Changing the count here means changing `MAX_BIN_PHOTOS` in both
`conversation-engine.js` and `src/components/digitalBin/AdditionalInfoStep.js`.
(`min={new Date().toISOString().split('T')[0]}`). Send today's date in the
customer's timezone.

## Wiring (already done)

`WHATSAPP_FLOW_ID` on the Netlify site switches the conversation engine over to
the Flow. With it set:

1. The customer shares a location pin in the chat as before.
2. `launchBookingFlow()` sends this Flow with `flow_token` = the session id —
   the completion payload carries no Flow id, so the token is the only way to
   correlate the reply with the conversation.
3. The customer fills the form; the completion arrives as `interactive/nfm_reply`
   and `extractMessage()` parses `response_json`.
4. `parseFlowResponse()` coerces and validates it, then the normal review step
   prices the booking and asks for confirmation in the chat.

Unset `WHATSAPP_FLOW_ID` and the engine asks the same questions message by
message instead. It also falls back to that automatically if the Flow cannot be
sent (unpublished, wrong id, revoked token) or if the completion payload fails
validation — a booking is never stranded.

Set `WHATSAPP_FLOW_MODE=draft` to test before publishing; `published` (the
default) for live.

Run `node netlify/functions/__checks__/whatsapp-smoke.js` to exercise the whole
path against stubs.

## Completion payload

The Flow completes with a `nfm_reply` message whose `response_json` carries:

```json
{
  "frequency": "one-time",
  "start_date": "2026-08-20",
  "preferred_time": "afternoon",
  "bag_count": "2",
  "bin_size_liters": "120",
  "waste_type": "general",
  "is_urgent": false,
  "notes": "Bin is behind the blue gate"
}
```

`bag_count` and `bin_size_liters` arrive as **strings** (selection components return
the option `id`), so parse them to integers before passing them to `quoteBooking()`
or `create_whatsapp_digital_bin`. `is_urgent` is a real boolean from the `OptIn`.
The ids were chosen to match `collected_data` in the conversation engine, so the
payload can be dropped straight into the existing confirmation step.

## Publishing

Upload under WhatsApp Manager → Flows, or via the Flows API:

```bash
curl -X POST "https://graph.facebook.com/v18.0/<WABA_ID>/flows" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  -F "name=TrashDrop bin pickup" \
  -F "categories=[\"OTHER\"]" \
  -F "flow_json=@bin-pickup.flow.json"
```

## Validate before uploading

```bash
python3 validate.py
```

Checks scalar types (`max-length` and friends must be integers, not strings —
Flow Builder rejects the string form), label and helper-text lengths against the
documented per-component limits (Dropdown/TextInput/TextArea labels 20 chars,
RadioButtonsGroup/CheckboxGroup 30, DatePicker 40, Footer 35, option titles 30,
helper-text 80), cross-screen `${screen.X.form.y}` references, `${data.x}`
declarations, terminal/`complete` pairing and screen reachability.

Flow Builder remains the only complete validator, and a published Flow's JSON is
versioned separately from this file, so re-upload after any edit here.
