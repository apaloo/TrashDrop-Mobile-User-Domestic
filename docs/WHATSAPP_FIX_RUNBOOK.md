# WhatsApp Booking Layer — Executable Fix Runbook

Status: **Phases 1–4 implemented in code.** Phase 0 (secret rotation, Netlify env,
guest auth user) and Phase 5 (apply migration, Meta/Supabase webhook config,
end-to-end test) are manual and still outstanding. Phase 6 is untouched.

---

## Implementation notes (what shipped, and where it differs from the plan)

The conversation now mirrors the in-app **Request Bin Pickup (No Bag)** flow
(`src/pages/DigitalBin.js`) step for step, rather than the shorter ad-hoc flow
the original plan assumed. That changed three things from the Phase 3 write-up:

1. **Five steps, same order as the app** — Bin Location → Schedule Details
   (frequency, pickup date, preferred time) → Waste Details (bin count, size,
   type, urgent) → Additional Info (notes) → Review & Submit. `BACK` walks the
   flow backwards the way the form's Back button does. Photos are skipped: the
   app uploads them to storage and they are not part of the `digital_bins` row.

2. **Pricing is the app's pricing, not a flat per-size table.** The planned
   `FALLBACK_PRICES` map only covered a base rate per size, which would have
   under-quoted every multi-bin and urgent booking. `netlify/functions/utils/pricing.js`
   is a server-side mirror of `src/utils/costCalculator.js`: GPS zone lookup via
   `find_nearest_pricing_zone`, `BASE_COSTS` fallback, then
   `base x bins + 30% urgent + GHS 1 request fee`, plus the promotional flat-rate
   path for WhatsApp users linked to an app account.

3. **The RPC had to widen.** `create_whatsapp_digital_bin` now also takes the
   schedule details text, notes, promotional flags and collector payout split, so
   a WhatsApp booking produces the same `digital_bins` row as the web form.
   See `supabase/migrations/20260819000000_whatsapp_align_digital_bin_flow.sql`,
   which supersedes the Phase 1 version of the function and also fixes two
   defects in it: `ST_GeogFromText` against a `geometry(Point,4326)` column, and
   location reuse keyed on `(user_id, location_name)` alone — which would have
   collided across customers, since unlinked bookings all share the guest owner.

Phase 4.1 shipped stricter than written: the notify function returns 500 when
`WHATSAPP_NOTIFY_SECRET` is unset. The webhook does the same for
`META_APP_SECRET` — an unset secret rejects rather than waving traffic through.

### QR code delivery

The app generates the bin's QR **client-side** (`src/utils/qrStorage.js`, via the
`qrcode` package) and keeps it in the Scheduled QR tab; nothing server-side ever
renders one, and the `qr_codes` table is never written. A WhatsApp customer has
no app to render it in, so the booking confirmation now generates the same code
server-side and sends it as a WhatsApp image (uploaded to Meta's media endpoint,
sent by media id — no public hosting needed). If the upload fails the booking
still stands and the link is sent as text instead.

**Open question — which value the QR should encode.** The app is inconsistent
with itself:

| Where | Encoded value |
|---|---|
| `DigitalBin.js:794` → `digital_bins.qr_code_url` | `https://trashdrop.app/bin/{locationId}` |
| `qrStorage.js:13` → the image shown in the app | `https://trashdrop.app/bin/{binId}` |

So the app's on-screen QR and its own stored `qr_code_url` point at different
things. The WhatsApp QR encodes `digital_bins.qr_code_url` read back from the
row, because that is the only server-side value a collector could resolve
against — but if the collector app expects the bin id, **both** the app's stored
column and this need correcting together. Confirm against the collector codebase
before go-live.

### Migration validation (local only)

Both WhatsApp migrations were applied and exercised on PostgreSQL 15.4 + PostGIS
in a throwaway container, against two schemas: a production-shaped one (the
tracked schema plus the columns prod has that this directory does not), and an
empty database replaying the whole migrations directory. Docker is **not** part
of the deploy path — GitHub Actions applies migrations to Supabase directly — it
was used purely as a local sandbox to prove the SQL before pushing.

Verified: booking RPC writes the quoted fee, guest ownership, `whatsapp_user_id`
tracing, expiry per frequency, SRID-4326 coordinates, location reuse on a
repeated pin, no cross-customer location collision, phone normalisation,
profile auto-link, dedupe RPC returning true then false, idle-session reuse, and
that `anon`/`authenticated` can neither read the tables nor execute any of the
six RPCs while `service_role` can do both.

### Pre-existing defects found while replaying the directory

Not introduced here and not fixed here, but the migrations directory cannot
currently be replayed from scratch:

- `20250101000000_create_qr_codes_table.sql:11` — `CONSTRAINT ... UNIQUE (...) WHERE (...)`
  is not valid SQL; a partial uniqueness rule has to be a partial unique *index*.
- `20250113000000_gps_pricing_zones.sql:210` — the Techiman row has six leading
  text values where the column list takes five, so the whole INSERT is rejected.
- Ordering: `20250120000000_add_bin_size_and_urgent.sql` sorts before the migration
  that creates `digital_bins`, so `bin_size_liters`/`is_urgent` never land on a
  replay. The alignment migration re-adds them under `IF NOT EXISTS` (a no-op in
  prod) so a booking still works, but the ordering itself is unfixed.
- `20250731000001_create_digital_bins_tables.sql` re-creates policies that
  `20250731000000_create_digital_bins_tables.sql` already created, and
  `20250731000002_add_test_user.sql` writes to an `auth.users` shape that no
  longer exists.

None of this blocks `supabase db push` against production, which only applies
migrations that are not already recorded.

---

## Phase 0 — Rotate secrets & configure environments (manual, ~15 min)

The staged `.env.whatsapp.example` contains a live Meta access token and a
Supabase key (which is actually the **anon** key, mislabeled as service role).
Treat both as leaked.

### 0.1 Meta (business.facebook.com / developers.facebook.com)

1. Business Settings → Users → System Users → select your system user →
   **revoke the existing token** (the one starting `EAActvKX...`).
2. Generate a new permanent token with `whatsapp_business_messaging` +
   `whatsapp_business_management` permissions. Copy it once — set it only in
   Netlify (step 0.3), never in a file.
3. App Dashboard → Settings → Basic → copy the **App Secret**
   (needed for webhook signature verification).

### 0.2 Supabase (supabase.com/dashboard → project `tfdedlqdsajjdjkerkli`)

1. Settings → API → copy the **service_role** key (starts `eyJ...`, payload
   role = `service_role`, NOT `anon`).
2. Authentication → Users → **Add user**:
   - Email: `whatsapp-guest@trashdrop.app`
   - Password: random (never used), auto-confirm ON.
   This is the fallback owner for bookings from WhatsApp users who have no
   app account (required because `digital_bins.user_id` is NOT NULL).

### 0.3 Netlify environment (from `trashdrop/`, with netlify CLI linked)

```bash
netlify env:set WHATSAPP_PHONE_NUMBER_ID   "<your phone number id>"
netlify env:set WHATSAPP_ACCESS_TOKEN      "<NEW token from 0.1>"
netlify env:set WHATSAPP_VERIFY_TOKEN      "$(openssl rand -hex 16)"
netlify env:set META_APP_SECRET            "<app secret from 0.1>"
netlify env:set SUPABASE_URL               "https://tfdedlqdsajjdjkerkli.supabase.co"
netlify env:set SUPABASE_SERVICE_ROLE_KEY  "<service_role key from 0.2>"
netlify env:set WHATSAPP_NOTIFY_SECRET     "$(openssl rand -hex 32)"
```

Note the generated `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_NOTIFY_SECRET`
values (`netlify env:get <name>`) — you need them for Meta webhook config
and the Supabase database webhook respectively.

### 0.4 Scrub the example file

```bash
git restore --staged trashdrop/.env.whatsapp.example
```

Then replace every real value in `trashdrop/.env.whatsapp.example` with a
placeholder (`your_..._here`). Add the new var:

```
META_APP_SECRET=your_meta_app_secret_here
```

The file was never committed, so scrubbing before commit keeps it out of
history entirely.

---

## Phase 1 — Rewrite the migration

### 1.1 Rename (fixes ordering: 20250527 sorts before applied 20250731 files)

```bash
git restore --staged supabase/migrations/20250527000000_whatsapp_booking_tables.sql
mv supabase/migrations/20250527000000_whatsapp_booking_tables.sql \
   supabase/migrations/20260716000000_whatsapp_booking_tables.sql
```

### 1.2 Replace the file content

Full replacement SQL. Changes vs. the original:
- `normalize_phone()` helper; used everywhere phones are compared/stored.
- No `USING (true)` RLS policies (RLS on + zero policies = service-role only).
- `REVOKE EXECUTE` on every function from PUBLIC/anon/authenticated.
- `digital_bins.whatsapp_user_id` column so bookings trace to the WhatsApp
  customer even when owned by the guest user.
- `create_whatsapp_digital_bin` falls back to the guest auth user and accepts
  the quoted fee instead of recomputing it (single source of truth: the
  conversation engine quote).
- `whatsapp_processed_messages` dedupe table + `record_whatsapp_message` RPC.
- `get_active_whatsapp_session` reuses the latest idle row instead of
  inserting a new one per booking cycle.

```sql
-- WhatsApp Booking Layer (v2) ------------------------------------------------
-- Conversational waste-collection booking via Meta WhatsApp Cloud API.
-- All access is via SECURITY DEFINER RPCs called with the service role key;
-- tables have RLS enabled with NO policies (deny all except service role).

-- Phone normalization: strip non-digits; convert Ghana local 0XXXXXXXXX to 233XXXXXXXXX
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN regexp_replace(p_phone, '\D', '', 'g') ~ '^0\d{9}$'
      THEN '233' || substring(regexp_replace(p_phone, '\D', '', 'g') FROM 2)
    ELSE regexp_replace(p_phone, '\D', '', 'g')
  END
$$;

-- Bridge table: WhatsApp phone numbers <-> Supabase auth users
CREATE TABLE IF NOT EXISTS public.whatsapp_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,          -- normalized digits, e.g. 233244000000
  user_id uuid,                        -- NULL until linked to an app account
  display_name text,
  language text DEFAULT 'en',
  is_active boolean DEFAULT true,
  total_bookings integer DEFAULT 0,
  last_booking_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT whatsapp_users_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_users_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Conversation state machine
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  whatsapp_user_id uuid NOT NULL,
  phone text NOT NULL,
  state text NOT NULL DEFAULT 'idle',
  collected_data jsonb DEFAULT '{}'::jsonb,
  last_message_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT whatsapp_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_sessions_whatsapp_user_id_fkey FOREIGN KEY (whatsapp_user_id)
    REFERENCES public.whatsapp_users(id) ON DELETE CASCADE
);

-- Webhook idempotency: Meta redelivers messages; process each id once
CREATE TABLE IF NOT EXISTS public.whatsapp_processed_messages (
  message_id text NOT NULL,
  phone text,
  received_at timestamptz DEFAULT now(),
  CONSTRAINT whatsapp_processed_messages_pkey PRIMARY KEY (message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone_active
  ON public.whatsapp_sessions(phone, state, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_users_phone
  ON public.whatsapp_users(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_messages_received
  ON public.whatsapp_processed_messages(received_at);

-- Trace WhatsApp bookings even when owned by the guest user
ALTER TABLE public.digital_bins
  ADD COLUMN IF NOT EXISTS whatsapp_user_id uuid
  REFERENCES public.whatsapp_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_digital_bins_whatsapp_user
  ON public.digital_bins(whatsapp_user_id)
  WHERE whatsapp_user_id IS NOT NULL;

-- Guest owner for unlinked WhatsApp bookings.
-- PREREQUISITE: create auth user whatsapp-guest@trashdrop.app in the dashboard.
CREATE OR REPLACE FUNCTION public.get_whatsapp_guest_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM auth.users WHERE email = 'whatsapp-guest@trashdrop.app' LIMIT 1
$$;

-- Idempotency check: returns true if this message id is new (and records it),
-- false if already processed. Opportunistically prunes rows older than 7 days.
CREATE OR REPLACE FUNCTION public.record_whatsapp_message(
  p_message_id text,
  p_phone text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.whatsapp_processed_messages
  WHERE received_at < now() - interval '7 days';

  INSERT INTO public.whatsapp_processed_messages (message_id, phone)
  VALUES (p_message_id, public.normalize_phone(p_phone));
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

-- Find or create a whatsapp_user by phone
CREATE OR REPLACE FUNCTION public.upsert_whatsapp_user(
  p_phone text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_phone text := public.normalize_phone(p_phone);
BEGIN
  SELECT id INTO v_id FROM public.whatsapp_users WHERE phone = v_phone;

  IF v_id IS NULL THEN
    INSERT INTO public.whatsapp_users (phone, display_name)
    VALUES (v_phone, p_display_name)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.whatsapp_users
    SET display_name = COALESCE(p_display_name, display_name),
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Get or create the active session for a phone (reuses latest idle row)
CREATE OR REPLACE FUNCTION public.get_active_whatsapp_session(
  p_phone text
)
RETURNS TABLE (
  session_id uuid,
  whatsapp_user_id uuid,
  state text,
  collected_data jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_phone text := public.normalize_phone(p_phone);
  v_wa_user_id uuid;
  v_session_id uuid;
  v_state text;
  v_data jsonb;
BEGIN
  SELECT id INTO v_wa_user_id FROM public.whatsapp_users WHERE phone = v_phone;
  IF v_wa_user_id IS NULL THEN
    INSERT INTO public.whatsapp_users (phone)
    VALUES (v_phone)
    RETURNING id INTO v_wa_user_id;
  END IF;

  -- Active (non-expired, non-idle) session first
  SELECT ws.id, ws.state, ws.collected_data
  INTO v_session_id, v_state, v_data
  FROM public.whatsapp_sessions ws
  WHERE ws.phone = v_phone
    AND ws.state != 'idle'
    AND ws.expires_at > now()
  ORDER BY ws.created_at DESC
  LIMIT 1;

  -- Otherwise reuse the most recent idle row
  IF v_session_id IS NULL THEN
    SELECT ws.id INTO v_session_id
    FROM public.whatsapp_sessions ws
    WHERE ws.phone = v_phone AND ws.state = 'idle'
    ORDER BY ws.created_at DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      UPDATE public.whatsapp_sessions
      SET collected_data = '{}'::jsonb,
          last_message_at = now(),
          expires_at = now() + interval '30 minutes',
          updated_at = now()
      WHERE id = v_session_id;
      v_state := 'idle';
      v_data := '{}'::jsonb;
    END IF;
  END IF;

  -- Truly new phone: create the row
  IF v_session_id IS NULL THEN
    INSERT INTO public.whatsapp_sessions (whatsapp_user_id, phone, state)
    VALUES (v_wa_user_id, v_phone, 'idle')
    RETURNING id, 'idle'::text, '{}'::jsonb INTO v_session_id, v_state, v_data;
  END IF;

  RETURN QUERY SELECT v_session_id, v_wa_user_id, v_state, v_data;
END;
$$;

-- Update session state and data (always refreshes expiry)
CREATE OR REPLACE FUNCTION public.update_whatsapp_session(
  p_session_id uuid,
  p_state text,
  p_collected_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.whatsapp_sessions
  SET state = p_state,
      collected_data = COALESCE(p_collected_data, collected_data),
      last_message_at = now(),
      expires_at = now() + interval '30 minutes',
      updated_at = now()
  WHERE id = p_session_id;
END;
$$;

-- Create a digital bin from a confirmed WhatsApp booking.
-- p_fee_total is the fee the user confirmed in chat (quote computed by the
-- conversation engine via find_nearest_pricing_zone) — stored as-is so the
-- record always matches what the customer was told.
CREATE OR REPLACE FUNCTION public.create_whatsapp_digital_bin(
  p_whatsapp_user_id uuid,
  p_location_name text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_fee_total numeric,
  p_waste_type text DEFAULT 'general',
  p_bin_size_liters integer DEFAULT 120,
  p_bag_count integer DEFAULT 1,
  p_frequency text DEFAULT 'one-time',
  p_is_urgent boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_location_id uuid;
  v_bin_id uuid;
BEGIN
  -- Linked app account, else the designated guest owner
  SELECT user_id INTO v_user_id
  FROM public.whatsapp_users WHERE id = p_whatsapp_user_id;

  IF v_user_id IS NULL THEN
    v_user_id := public.get_whatsapp_guest_user_id();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp guest user (whatsapp-guest@trashdrop.app) does not exist';
  END IF;

  SELECT id INTO v_location_id
  FROM public.bin_locations
  WHERE user_id = v_user_id AND location_name = p_location_name
  LIMIT 1;

  IF v_location_id IS NULL THEN
    INSERT INTO public.bin_locations (user_id, location_name, address, coordinates)
    VALUES (
      v_user_id,
      p_location_name,
      p_address,
      ST_GeogFromText('POINT(' || p_longitude || ' ' || p_latitude || ')')
    )
    RETURNING id INTO v_location_id;
  END IF;

  INSERT INTO public.digital_bins (
    user_id, whatsapp_user_id, location_id, qr_code_url, frequency, waste_type,
    bag_count, bin_size_liters, is_urgent, fee, status, expires_at
  ) VALUES (
    v_user_id, p_whatsapp_user_id, v_location_id,
    'whatsapp-bin-' || gen_random_uuid()::text,
    p_frequency, p_waste_type, p_bag_count, p_bin_size_liters, p_is_urgent,
    COALESCE(p_fee_total, 0), 'pending', now() + interval '7 days'
  )
  RETURNING id INTO v_bin_id;

  UPDATE public.whatsapp_users
  SET total_bookings = total_bookings + 1,
      last_booking_at = now(),
      updated_at = now()
  WHERE id = p_whatsapp_user_id;

  RETURN v_bin_id;
END;
$$;

-- Auto-link WhatsApp user when a profile gains a matching phone
CREATE OR REPLACE FUNCTION public.link_whatsapp_user_on_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    UPDATE public.whatsapp_users
    SET user_id = NEW.id, updated_at = now()
    WHERE phone = public.normalize_phone(NEW.phone)
      AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_whatsapp_on_profile ON public.profiles;
CREATE TRIGGER trg_link_whatsapp_on_profile
  AFTER INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.link_whatsapp_user_on_profile_update();

-- Lock down: RLS on, NO policies -> only service role can touch the tables.
ALTER TABLE public.whatsapp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER functions default to PUBLIC execute; restrict to service role.
REVOKE EXECUTE ON FUNCTION public.upsert_whatsapp_user(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_active_whatsapp_session(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_whatsapp_session(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_whatsapp_digital_bin(uuid, text, text, numeric, numeric, numeric, text, integer, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_whatsapp_message(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_guest_user_id() FROM PUBLIC, anon, authenticated;
```

### 1.3 Fix the CI trigger path

`.github/workflows/supabase-migrations.yml` triggers on `migrations/**` but
`supabase db push` applies `supabase/migrations/`. Change the trigger:

```yaml
    paths:
      - 'supabase/migrations/**'
```

(Also resolve the duplicate-timestamp pair `20250731000000_backup_and_migrate_data.sql`
/ `20250731000000_create_digital_bins_tables.sql` when convenient — if both are
already applied in prod, `supabase migration list` will show it; renumber only
if unapplied.)

---

## Phase 2 — Webhook security (`trashdrop/netlify/functions/whatsapp-webhook.js`)

### 2.1 Signature verification

Add at the top:

```js
const crypto = require('crypto');

function getRawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
}

function isValidSignature(event, rawBody) {
  const appSecret = process.env.META_APP_SECRET;
  const signature = event.headers['x-hub-signature-256'];
  if (!appSecret || !signature) return false;

  const expected = 'sha256=' +
    crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  return signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

In the POST branch, before parsing:

```js
const rawBody = getRawBody(event);
if (!isValidSignature(event, rawBody)) {
  console.warn('[WhatsApp Webhook] Invalid signature — rejecting');
  return { statusCode: 401, body: 'Invalid signature' };
}
const body = JSON.parse(rawBody || '{}');
```

### 2.2 Idempotency (after extracting `message`, before processing)

```js
const { data: isNew } = await supabase.rpc('record_whatsapp_message', {
  p_message_id: message.messageId,
  p_phone: phone,
});
if (isNew === false) {
  console.log(`[WhatsApp Webhook] Duplicate message ${message.messageId} — skipping`);
  return { statusCode: 200, body: 'OK' };
}
```

(Move the `getSupabaseClient()` call above this block.)

### 2.3 Always persist session state

Replace the `if (result.newState !== session.state || result.newData !== session.collected_data)`
condition with an unconditional call — the reference comparison skips expiry
refreshes on retry prompts:

```js
await supabase.rpc('update_whatsapp_session', {
  p_session_id: session.id,
  p_state: result.newState,
  p_collected_data: result.newData,
});
```

---

## Phase 3 — Conversation engine (`trashdrop/netlify/functions/utils/conversation-engine.js`)

### 3.1 Scope numeric shortcuts to idle

In `processMessage`, keep only true globals:

```js
if (text === 'cancel' || text === 'stop') { ...cancel as before... }
```

Delete the global `status`/`'2'` block. In `handleIdle`, add before the
default booking-start branch:

```js
if (text === 'status' || text === '2') {
  await handleStatusRequest(phone, supabase, session);
  return { newState: STATES.IDLE, newData: {}, done: true };
}
```

(`handleIdle` needs `session` passed through — update its signature and the
two call sites in the switch.)

### 3.2 Single pricing source: nearest-zone RPC + one fallback table

Replace the pricing block in `handleLocation` (`.from('pricing_zones')...limit(1)`)
with the existing GPS RPC, and align the fallback with the app's
`costCalculator.js` `BASE_COSTS`:

```js
// Same values as trashdrop/src/utils/costCalculator.js BASE_COSTS
const FALLBACK_PRICES = { 60: 15, 80: 18, 90: 22, 100: 25, 120: 30, 240: 40, 340: 55, 360: 60, 660: 85, 1100: 120 };

let fee = null;
try {
  const { data: zones } = await supabase.rpc('find_nearest_pricing_zone', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_max_distance_km: 10,
  });
  const zone = Array.isArray(zones) ? zones[0] : zones;
  if (zone) fee = Number(zone[`price_${data.bin_size_liters}l`]) || null;
} catch (err) {
  console.error('[Conversation] Pricing lookup error:', err.message);
}
if (!fee) fee = FALLBACK_PRICES[data.bin_size_liters] || 50;
```

### 3.3 Pass the quoted fee to the RPC

In `handleConfirmation`, add to the `create_whatsapp_digital_bin` params:

```js
p_fee_total: data.total_fee,
```

### 3.4 Status for unlinked users

Rewrite `handleStatusRequest` to query by `whatsapp_user_id` (works for guest
bookings) or linked `user_id`:

```js
async function handleStatusRequest(phone, supabase, session) {
  try {
    const { data: waUser } = await supabase
      .from('whatsapp_users')
      .select('id, user_id')
      .eq('id', session.whatsapp_user_id)
      .single();

    const orFilter = waUser?.user_id
      ? `whatsapp_user_id.eq.${waUser.id},user_id.eq.${waUser.user_id}`
      : `whatsapp_user_id.eq.${session.whatsapp_user_id}`;

    const { data: bins } = await supabase
      .from('digital_bins')
      .select('id, status, waste_type, bin_size_liters, bag_count, fee, created_at')
      .or(orFilter)
      .in('status', ['pending', 'available', 'accepted', 'en_route', 'arrived', 'collecting'])
      .order('created_at', { ascending: false })
      .limit(3);
    // ...rest unchanged...
```

### 3.5 Idle pricing text

Update the hardcoded prices in the idle `price` reply to match
`FALLBACK_PRICES` (120L from GHS 30, 240L from GHS 40, 360L from GHS 60), or
drop the numbers and say pricing depends on location.

---

## Phase 4 — Notify function & dependency cleanup

### 4.1 Fail closed (`whatsapp-notify.js`)

```js
const expectedSecret = process.env.WHATSAPP_NOTIFY_SECRET;
if (!expectedSecret) {
  console.error('[WhatsApp Notify] WHATSAPP_NOTIFY_SECRET not configured');
  return { statusCode: 500, body: 'Not configured' };
}
if (authHeader !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
  return { statusCode: 401, body: 'Unauthorized' };
}
```

### 4.2 Notify lookup for guest bookings

In `whatsapp-notify.js`, prefer the new column:

```js
let waPhone = null;
if (digitalBin.whatsapp_user_id) {
  const { data } = await supabase
    .from('whatsapp_users').select('phone')
    .eq('id', digitalBin.whatsapp_user_id).single();
  waPhone = data?.phone || null;
} else {
  const { data } = await supabase
    .from('whatsapp_users').select('phone')
    .eq('user_id', digitalBin.user_id).single();
  waPhone = data?.phone || null;
}
```

### 4.3 Remove node-fetch

```bash
cd trashdrop && npm uninstall node-fetch
```

In `utils/whatsapp-api.js`, delete the `fetchFn` fallback line and use global
`fetch` directly (Netlify functions run Node 18+).

### 4.4 Await markAsRead (webhook)

```js
await markAsRead(message.messageId).catch(() => {});
```

---

## Phase 5 — Deploy & verify

### 5.1 Apply migration

```bash
supabase link --project-ref tfdedlqdsajjdjkerkli   # if not linked
supabase db push
```

If the CLI complains the file predates applied migrations, you renamed
incorrectly — the filename must sort after `20250731000002_add_test_user.sql`.

### 5.2 Configure Meta webhook

developers.facebook.com → your app → WhatsApp → Configuration:
- Callback URL: `https://<site>.netlify.app/.netlify/functions/whatsapp-webhook`
- Verify token: the `WHATSAPP_VERIFY_TOKEN` value
- Subscribe to the `messages` field.

### 5.3 Configure Supabase database webhook

Dashboard → Database → Webhooks → Create:
- Table `digital_bins`, event UPDATE
- URL `https://<site>.netlify.app/.netlify/functions/whatsapp-notify`
- Header `x-webhook-secret: <WHATSAPP_NOTIFY_SECRET value>`

### 5.4 Test checklist

```bash
# Forged payload must be rejected (401):
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://<site>.netlify.app/.netlify/functions/whatsapp-webhook" \
  -H 'Content-Type: application/json' -d '{"entry":[]}'

# Valid signature must pass (200):
BODY='{"entry":[]}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -r | cut -d' ' -f1)"
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://<site>.netlify.app/.netlify/functions/whatsapp-webhook" \
  -H 'Content-Type: application/json' -H "x-hub-signature-256: $SIG" -d "$BODY"
```

With Meta's test number, verify end to end:
- [ ] Happy path: hi → share location → frequency → date → time → **reply "2" for bin count works** → size → bin type → urgent → notes → quoted fee → confirm → bin row created with `fee == quoted total` and `whatsapp_user_id` set, owned by guest user
- [ ] The QR image arrives after the confirmation and scans to the same value as `digital_bins.qr_code_url`
- [ ] `BACK` steps backwards through the flow without losing earlier answers
- [ ] "status" from idle lists the booking (unlinked user)
- [ ] Replaying the same signed payload twice creates only one bin
- [ ] "cancel" mid-flow resets to idle
- [ ] Updating the bin's status to `accepted` in the dashboard fires a WhatsApp notification
- [ ] With the **anon** key: `select * from whatsapp_users` and calling the RPCs both fail

---

## Phase 6 (optional, separate commit) — repo cleanup

```bash
# Editor/backup debris
git rm --cached -r trashdrop/temp_edits temp_edits 2>/dev/null
git rm trashdrop/src/App.js.backup trashdrop/src/context/AuthContext.patch.js \
       trashdrop/src/contexts/AuthContext.js \
       trashdrop/src/components/DumpingReportForm.js.bak2 \
       trashdrop/src/components/DumpingReportForm.js.before_fix \
       trashdrop/src/components/DumpingReportForm.js.orig \
       trashdrop/src/pages/CollectorPickup.js.fixed

# Archive fix-log docs out of the root
mkdir -p docs/history && git mv *_FIX.md *_FIXES.md *_SUMMARY.md docs/history/ 2>/dev/null
```

Verify nothing imports removed files (`grep -rn "AuthContext.patch\|contexts/AuthContext" trashdrop/src`)
and the build passes (`cd trashdrop && npm run build:clean`) before committing.
