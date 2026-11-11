# Release checklist for critical workflows

Paste the relevant section into the pull request and tick it before merging
a change that touches a critical workflow (programme §8.2). Test on
**staging** with synthetic data, on a low-end Android phone and on desktop.

## QR Bag: BUY → SCAN → COLLECT

- [ ] Batch/bundle registration creates the expected bags
- [ ] Activating a parent QR activates its child QRs
- [ ] Each child QR is unique; a duplicate is rejected
- [ ] Household bag balance updates after purchase and after collection
- [ ] Carter scan accepts a valid bag assigned to them
- [ ] Re-scanning the same bag does not double-count (idempotent)
- [ ] A bag already collected on another pickup is rejected
- [ ] The collection record shows carter, household, time and bags

## Digital Bin: REQUEST → QUOTE → TRACK

- [ ] Request submits with a valid location; outside coverage is refused clearly
- [ ] The quote shown equals the server price (`td_price_digital_bin`); the pricing guard tests pass
- [ ] Promotion applied and refunded on cancel as specified in `docs/DIGITAL_BIN_PRICING.md`
- [ ] Assignment to a carter and the schedule appear for both sides
- [ ] Status changes reach the household (in-app, WhatsApp)
- [ ] Completion is verified and appears in the history
- [ ] The same flow works through WhatsApp booking

## Illegal dumping report

- [ ] Photo capture and upload on a slow connection
- [ ] GPS captured; manual fallback works when GPS is denied
- [ ] Duplicate nearby report is detected
- [ ] Report reaches the right authority / area
- [ ] Field verification and closure photo recorded; points awarded once

## Payments and payouts

- [ ] Transaction created with the correct amount (server-computed)
- [ ] Success, failure and timeout states shown correctly
- [ ] Webhook with a bad signature is rejected
- [ ] Repeated webhook does not pay twice
- [ ] Carter earnings and withdrawable balance match the completed jobs
- [ ] Reversal/refund path works
- [ ] Every money movement has an audit record

## Sign-off

- QA: <name>, <date>
- Business owner acceptance: <name>, <date>
