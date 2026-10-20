#!/usr/bin/env bash
# Go-live check for the WhatsApp booking layer.
# Read-only: reports what is configured and what the deployed endpoints do.
# Usage:  ./scripts/verify-whatsapp-setup.sh [site-url]
set -uo pipefail

URL="${1:-https://app.trashdrops.com}"
# META_APP_SECRET and META_ACCESS_TOKEN carry a different value per deploy
# context. `netlify env:list` defaults to `dev`, so without this the script signs
# a payload with the dev secret, the production function validates it with the
# production secret, and a healthy site is reported as a signature failure.
CONTEXT="${NETLIFY_CONTEXT:-production}"
pass=0; fail=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }
note() { printf '        %s\n' "$1"; }

echo "WhatsApp booking layer — go-live check"
echo "site: $URL"
echo
echo "1. Environment (values are never printed)"

echo "context: $CONTEXT"
ENVJSON=$(netlify env:list --context "$CONTEXT" --json 2>/dev/null)
have() { echo "$ENVJSON" | python3 -c "import json,sys;print('y' if '$1' in json.load(sys.stdin) else 'n')" 2>/dev/null; }
getv() { echo "$ENVJSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null; }

for v in META_PHONE_NUMBER_ID META_ACCESS_TOKEN META_APP_SECRET \
         WHATSAPP_VERIFY_TOKEN WHATSAPP_NOTIFY_SECRET WHATSAPP_FLOW_ID SUPABASE_URL; do
  [ "$(have $v)" = y ] && ok "$v set" || bad "$v missing"
done

# These four are easy to paste into the wrong box; check their shapes
TOKEN=$(getv META_ACCESS_TOKEN); SECRET=$(getv META_APP_SECRET)
case "$TOKEN" in
  EAA*) ok "META_ACCESS_TOKEN has access-token shape";;
  "")   : ;;
  *)    bad "META_ACCESS_TOKEN is ${#TOKEN} chars and does not start with EAA — not an access token"
        note "a 32-char hex value is an App Secret; check the two are not swapped";;
esac
if [ -n "$SECRET" ]; then
  if printf '%s' "$SECRET" | grep -qE '^[0-9a-f]{32}$'; then
    ok "META_APP_SECRET has app-secret shape (32 hex)"
  else
    bad "META_APP_SECRET is ${#SECRET} chars — an App Secret is 32 hexadecimal characters"
  fi
fi

# Does the token actually work against the phone number?
PHONE=$(getv META_PHONE_NUMBER_ID)
if [ -n "$TOKEN" ] && [ -n "$PHONE" ]; then
  RESP=$(curl -s -H "Authorization: Bearer $TOKEN" \
         "https://graph.facebook.com/v18.0/${PHONE}?fields=display_phone_number,verified_name" --max-time 25)
  if echo "$RESP" | grep -q display_phone_number; then
    ok "token authenticates against the phone number id"
  else
    bad "Graph rejected the token: $(echo "$RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("error",{}).get("message","?")[:80])' 2>/dev/null)"
  fi
fi

# service_role key must exist under some name, and must not be the anon key
ROLE=$(python3 - <<PY
import json,base64,os
env=json.loads('''$ENVJSON''' or '{}')
def role(k):
    try:
        p=k.split('.')[1]; p+='='*(-len(p)%4)
        return json.loads(base64.urlsafe_b64decode(p)).get('role')
    except Exception: return None
for n in ('SUPABASE_SERVICE_ROLE','SUPABASE_SERVICE_ROLE_KEY'):
    if role(env.get(n,'') or '')=='service_role':
        print(n); break
else: print('')
PY
)
[ -n "$ROLE" ] && ok "service_role key present (in $ROLE)" || bad "no variable holds a service_role key"

# The superseded variable still holds the leaked token until it is revoked
OLD=$(getv WHATSAPP_ACCESS_TOKEN)
case "$OLD" in
  EAActvKX*) bad "WHATSAPP_ACCESS_TOKEN still holds the leaked token — revoke it in Meta and delete the variable";;
  "")        ok "no stale WHATSAPP_ACCESS_TOKEN left behind";;
  *)         : ;;
esac

echo
echo "2. Deployed endpoint behaviour"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/.netlify/functions/whatsapp-webhook" \
       -H 'content-type: application/json' -d '{"entry":[]}' --max-time 25)
[ "$code" = 401 ] && ok "webhook rejects an unsigned payload (401)" \
                  || bad "webhook returned $code for an unsigned payload — signature check not live"

SECRET=$(getv META_APP_SECRET)
if [ -n "$SECRET" ]; then
  BODY='{"entry":[]}'
  SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/.netlify/functions/whatsapp-webhook" \
         -H 'content-type: application/json' -H "x-hub-signature-256: $SIG" -d "$BODY" --max-time 25)
  [ "$code" = 200 ] && ok "webhook accepts a correctly signed payload (200)" \
                    || bad "webhook returned $code for a correctly signed payload"
else
  note "skipped signed-payload test (META_APP_SECRET not set)"
fi

VT=$(getv WHATSAPP_VERIFY_TOKEN)
if [ -n "$VT" ]; then
  ch=$(curl -s "$URL/.netlify/functions/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=$VT&hub.challenge=ping" --max-time 25)
  [ "$ch" = ping ] && ok "webhook completes Meta's verification handshake" \
                   || bad "verification handshake returned '$ch' instead of the challenge"
fi

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/.netlify/functions/whatsapp-notify" \
       -H 'content-type: application/json' \
       -d '{"digital_bin_id":"00000000-0000-4000-8000-000000000000"}' --max-time 25)
case "$code" in
  401|500) ok "notify rejects an unauthenticated request ($code)";;
  *)       bad "notify returned $code without a secret — endpoint is open";;
esac

echo
echo "3. Meta-side delivery"
# Everything above can pass while Meta sends nothing at all: the endpoints only
# hear from Meta if an app is subscribed to the WABA and its callback URL points
# here. Both have been wrong before, and both fail silently.
WABA=$(getv META_BUSINESS_ACCOUNT_ID)
if [ -z "$WABA" ] || [ -z "$TOKEN" ]; then
  note "skipped (needs META_BUSINESS_ACCOUNT_ID and META_ACCESS_TOKEN)"
else
  SUBS=$(curl -s -H "Authorization: Bearer $TOKEN" \
         "https://graph.facebook.com/v21.0/${WABA}/subscribed_apps" --max-time 25)
  # A rejected token returns an error body, not an empty list. Reporting that as
  # "nothing is subscribed" sends you to fix the wrong thing.
  if echo "$SUBS" | grep -q '"error"'; then
    bad "Graph rejected the subscription query — cannot tell what is subscribed"
    note "$(echo "$SUBS" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("error",{}).get("message","?")[:90])' 2>/dev/null)"
  elif echo "$SUBS" | grep -q whatsapp_business_api_data; then
    ok "an app is subscribed to WABA $WABA"
    echo "$SUBS" | python3 -c '
import json,sys
for d in json.load(sys.stdin).get("data",[]):
    a=d.get("whatsapp_business_api_data",{})
    print("        app: %s (%s)" % (a.get("name","?"), a.get("id","?")))
' 2>/dev/null
    note "confirm in Meta: the app callback URL is $URL/.netlify/functions/whatsapp-webhook"
    note "and that the 'messages' webhook field is Subscribed, not just configured"
  else
    bad "no app is subscribed to WABA $WABA — inbound messages are delivered nowhere"
    note "WhatsApp Manager > the app > Configure Webhooks, then subscribe 'messages'"
  fi
fi

echo
echo "4. Flow"
FID=$(getv WHATSAPP_FLOW_ID); MODE=$(getv WHATSAPP_FLOW_MODE)
[ -n "$FID" ] && ok "flow id $FID (mode: ${MODE:-published})" || bad "WHATSAPP_FLOW_ID missing"

if [ -n "$FID" ] && [ -n "$TOKEN" ]; then
  FLOW=$(curl -s -H "Authorization: Bearer $TOKEN" \
         "https://graph.facebook.com/v21.0/${FID}?fields=name,status,validation_errors" --max-time 25)
  STATUS=$(echo "$FLOW" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("status",""))' 2>/dev/null)
  EFFMODE=$(printf '%s' "${MODE:-published}" | tr '[:upper:]' '[:lower:]')

  case "$STATUS" in
    PUBLISHED)
      if [ "$EFFMODE" = draft ]; then
        bad "flow is PUBLISHED but WHATSAPP_FLOW_MODE=draft — Meta rejects mode:draft on a published flow"
      else
        ok "flow is PUBLISHED and WHATSAPP_FLOW_MODE=$EFFMODE"
      fi;;
    DRAFT)
      if [ "$EFFMODE" = draft ]; then
        ok "flow is DRAFT and WHATSAPP_FLOW_MODE=draft (admins only — publish before real customers)"
      else
        bad "flow is DRAFT but WHATSAPP_FLOW_MODE=$EFFMODE — every send fails with (#132000) Flow not published"
        note "the engine then falls back to chat, where bin photos are refused by design"
        note "fix: node scripts/upload-whatsapp-flow.js --publish   (or set WHATSAPP_FLOW_MODE=draft to test)"
      fi;;
    "") if echo "$FLOW" | grep -q '"error"'; then
          bad "Graph rejected the flow query — cannot tell whether the flow is published"
          note "$(echo "$FLOW" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("error",{}).get("message","?")[:90])' 2>/dev/null)"
        else
          bad "flow $FID returned no status — check the id"
        fi;;
    *)  bad "flow status is $STATUS";;
  esac

  echo "$FLOW" | python3 -c '
import json,sys
errs=json.load(sys.stdin).get("validation_errors") or []
for e in errs:
    print("        validation: %s" % e.get("message","?"))
' 2>/dev/null
fi

echo
printf 'result: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
