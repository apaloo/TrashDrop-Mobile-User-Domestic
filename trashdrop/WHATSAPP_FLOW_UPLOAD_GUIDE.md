# Uploading the WhatsApp Flow

`scripts/upload-whatsapp-flow.js` pushes `whatsapp-flows/bin-pickup.flow.json` to
Meta's Flows API and, when you ask it to, publishes the result.

## Prerequisites

| Variable | Needed for | What it is |
| --- | --- | --- |
| `META_ACCESS_TOKEN` | everything | System user token with `whatsapp_business_management`. Starts `EAA`. |
| `WHATSAPP_FLOW_ID` | updating | The Flow to update. `FLOW_ID` is also accepted. |
| `META_BUSINESS_ACCOUNT_ID` | `--create` only | The WABA id. |
| `FLOW_JSON_PATH` | optional | Defaults to `whatsapp-flows/bin-pickup.flow.json`. |
| `GRAPH_VERSION` | optional | Defaults to `v21.0`. |

Nothing is read from `.env` — export the values yourself, so a production token is
never a file you can commit by accident:

```bash
export META_ACCESS_TOKEN="EAA..."
export WHATSAPP_FLOW_ID="2122136435396715"
```

## Usage

Check what is deployed without changing anything:

```bash
npm run whatsapp:flow-status
```

Upload the local Flow JSON. This leaves the Flow in whatever state it was already
in — a published Flow's live version does not change until you publish:

```bash
npm run whatsapp:upload-flow
```

Upload and publish in one go:

```bash
node scripts/upload-whatsapp-flow.js --publish
```

Create a brand-new Flow (prints the new id; nothing uses it until you set
`WHATSAPP_FLOW_ID`):

```bash
node scripts/upload-whatsapp-flow.js --create
```

## Validate first

`whatsapp-flows/validate.py` catches the mistakes Flow Builder rejects — string
values where Meta wants integers, labels over the per-component character limits,
`${screen.X.form.y}` references to fields that do not exist, unreachable screens:

```bash
python3 whatsapp-flows/validate.py
```

It is a local pre-check, not a substitute for Meta's own validation. The upload
script prints Meta's `validation_errors` verbatim and exits non-zero when there
are any, so a rejected upload is never mistaken for a successful one.

## How the API actually works

Worth knowing, because getting it wrong fails silently:

- **Flow JSON is updated only through `POST /<FLOW_ID>/assets`**, as multipart with
  `name=flow.json`, `asset_type=FLOW_JSON` and the file itself.
- **`POST /<FLOW_ID>` accepts only `name`, `categories` and `endpoint_uri`.** Sending
  `flow_json` there returns 200 and updates nothing. A Flow can sit on a months-old
  version this way while every upload appears to succeed.
- **`POST /<WABA_ID>/flows` accepts `flow_json` inline** on creation.
- **`POST /<FLOW_ID>/publish` takes no parameters** and fails if validation errors or
  publishing checks are outstanding.

## What the script will not do

- **It will not create a Flow as a fallback.** If `WHATSAPP_FLOW_ID` points at
  something that does not exist, it stops. Creating one instead would leave a new
  id that `WHATSAPP_FLOW_ID` does not point at, so the site would keep sending the
  old Flow while you believed you had just fixed it. Creating is opt-in.
- **It will not edit the Flow JSON in transit.** Keys such as `routing_model` and
  `data_api_version` are uploaded exactly as the file has them. Stripping a key
  changes the Flow's behaviour without changing the file in git, and the repo
  stops describing what is deployed.
- **It will not publish unless you pass `--publish`.** Publishing takes effect for
  customers immediately.

## After publishing

The site only sends a Flow it believes is live. `sendFlowMessage()` adds
`mode: 'draft'` **only** when `WHATSAPP_FLOW_MODE=draft`; the default is
`published`. So:

- Flow published → leave `WHATSAPP_FLOW_MODE` unset or `published`.
- Flow still a draft → set `WHATSAPP_FLOW_MODE=draft` to test. Draft mode works
  only for the Flow's own admins, not for ordinary customers.

Getting this pair wrong is quiet rather than loud: Meta returns
`(#132000) Flow not published`, `handleLocation()` catches it and falls back to
collecting the booking message-by-message in the chat. The booking still
completes — but the chat path refuses photo attachments by design, so **bin photos
are silently impossible** until the Flow is genuinely live.

```bash
netlify env:set WHATSAPP_FLOW_ID "<flow id>"
netlify env:set WHATSAPP_FLOW_MODE "published"
```

## Related

- `whatsapp-flows/README.md` — what the Flow collects and why location, price and
  confirmation stay in the chat.
- `netlify/functions/__checks__/whatsapp-smoke.js` — exercises the whole booking
  path against stubs, including the not-published fallback.
