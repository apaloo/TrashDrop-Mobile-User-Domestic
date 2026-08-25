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
(`min={new Date().toISOString().split('T')[0]}`). Send today's date in the
customer's timezone.

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
