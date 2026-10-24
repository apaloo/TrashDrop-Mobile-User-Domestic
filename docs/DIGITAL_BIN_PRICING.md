# TrashDrop Digital Bin Pricing (accepted)

**Status:** accepted by the owner and live in production since 2026-10-24.
**Protected:** don't change these rules, or the code and database objects that
implement them, without the owner's written approval in the pull request. If a
change is approved, update this document, the tests listed below and the
database in the same change.

## The rules

### Who sets the price
The **database** prices every new digital bin when it is saved, from the app,
from WhatsApp, or from anything else. It overwrites whatever fee, payout and
promotion fields the client sends (`digital_bins_set_price` →
`td_price_digital_bin()`). The app and WhatsApp work the price out the same way
only to show it before booking.

### Standard price
- Base = the price for the bin size in the **pricing zone covering the bin's
  location** (`get_covering_pricing_zone`, column `price_<size>l`) × bags.
- +30% of the base if the pickup is **urgent**.
- + **GHS 1** request fee.
- Collector payout at booking = base + urgent.
- There is no default price. A location outside every zone, or a size the zone
  doesn't price, is refused (`TDC01` / `TDC02`).

Example (zone price GHS 40 for 240 L): 240 L × 2 bags = 80 + 1 = **GHS 81**;
urgent = 80 + 24 + 1 = **GHS 105**.

### Promotional price
- Applies when the booking is **not urgent**, the customer **has promotions
  left** (`promotional_usage.used_count < max_requests`, 5 by default) and the
  size has an **active `promotional_fee_schedule` row**.
- Customer pays the schedule's **client fee × bags**; no urgent surcharge and no
  request fee.
- Collector is paid the schedule's **collector payout × bags**; TrashDrop covers
  the difference (the subsidy).
- One promotion is used up **in the same statement that saves the bin**, so two
  bookings can't both take the last one. App and WhatsApp bookings count alike.
- Urgent bookings always pay the standard price and don't use a promotion.
- Accounts without a `promotional_usage` row (created before the signup
  trigger) get no promotions.

Example (240 L schedule 22 / 40): 240 L × 2 bags = customer **GHS 44**,
collector **GHS 80**, TrashDrop **GHS 36**.

### Cancelling
Cancelling a promotional bin gives the promotion back. A bin counts as
cancelled when its status is cancelled, or it is inactive and not completed
(the app's Cancel button). Reactivating it takes the promotion again.

### Protection
- Customers can only **read** their own `promotional_usage` row.
- The customer who booked a bin can't change its fee, size, bags, urgency,
  promotion fields or payouts afterwards.
- Collectors record their final payout at disposal (collector app,
  `disposalService`): standard bins by the SOP v4.5.6 split, promotional bins
  at the payout stored with the bin.

## Where it lives

| Part | Repository | File / object |
|---|---|---|
| Price, promotion count, protection, refund | household app | `trashdrop/supabase/migrations/20261024000000_server_side_bin_pricing.sql`, `20261024010000_revoke_promotional_usage_truncate.sql`, `20261024020000_refund_promotion_on_app_cancel.sql` |
| Undo | household app | `trashdrop/supabase/diagnostics/server_side_bin_pricing_rollback.sql` |
| Health check (read-only) | household app | `trashdrop/supabase/diagnostics/digital_bin_pricing_check.sql` |
| Price shown before booking | household app | `trashdrop/src/services/digitalBinService.js`, `trashdrop/src/components/digitalBin/ReviewStep.js`, `trashdrop/src/utils/costCalculator.js`, `trashdrop/src/services/gpsPricingService.js` |
| WhatsApp quote | household app | `trashdrop/netlify/functions/utils/pricing.js` |
| Collector payout | collector app | `src/utils/paymentCalculations.js` (`promotionalPayout`), `src/services/disposalService.js`, `src/services/paymentService.js` |
| Admin checks | admin site | `src/utils/pickupRequestUtils.js` (`feeBreakdown`), `supabase/migrations/20261107_fee_mismatch_pricing.sql` (alert rule 9) |

## Tests that guard it
CI runs these on every pull request (household app, `.github/workflows/ci-cd.yml`):
- `trashdrop/src/services/__tests__/digitalBinService.promotion.test.js`
- `trashdrop/netlify/functions/__checks__/pricing-promo.js`

Also:
- collector app: `src/utils/__tests__/promotionalPayout.test.js`
- admin site: `src/utils/__tests__/pickupRequestUtils.test.js` (fees)

In production, run `trashdrop/supabase/diagnostics/digital_bin_pricing_check.sql`
(read-only). Every row should say `ok`.
