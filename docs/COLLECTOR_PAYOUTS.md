# TrashDrop Collector Payouts: digital bins (accepted)

**Status:** accepted by the owner on 2026-11-12 ("the collector app actually
earns 85–92% of the base depending on travel distance, plus 75% of urgent").
**Protected:** these rules, and the code and database objects that implement
them, change only with the owner's written approval in the pull request
(`CLAUDE.md` in this and the collector repository). If a change is approved,
update this document, the tests, the database (a new migration) and the
recorded fingerprints in the same change
([protected rules runbook](../engineering/runbooks/protected-rules.md)).

Prices and promotions are in [`DIGITAL_BIN_PRICING.md`](DIGITAL_BIN_PRICING.md).
This document says what the collector earns from a bin and how it is paid out.

## The rules

### The booked payout is the ceiling
When a bin is booked the database stores its payout with it
(`collector_total_payout`):
- standard bin: base + urgent surcharge (the bill minus the GH₵1 request fee);
- promotional bin: the schedule's collector payout × bags.

Nothing the collector app sends can change it afterwards
(`td_keep_booked_payout`). A collector is never paid more than it for a bin.

### What the collector earns: standard bins
From the amount the client paid (`total_bill`):
1. The **GH₵1 request fee** goes to TrashDrop.
2. If the bin is **urgent**, the rest is split into base and urgent surcharge
   (base = rest ÷ 1.30). The collector earns **75% of the urgent surcharge**.
3. The collector earns a share of the **base** that depends on the travel
   distance from the collector to the bin when they accepted it:

| Travel distance | Collector's share of the base |
|---|---|
| up to 2 km | 85% |
| over 2 km, up to 5 km | 87% |
| over 5 km, up to 10 km | 89% |
| over 10 km | 92% |
| not known | 87% |

4. TrashDrop keeps the rest.

Example (GH₵26 bin, not urgent, 1.5 km): 26 − 1 = 25; collector 85% of 25 =
**GH₵21.25**; TrashDrop 3.75 + 1 = GH₵4.75. Booked payout (the ceiling): GH₵25.

### What the collector earns: promotional bins
The booked promotional payout, whatever the client paid. TrashDrop covers the
difference (`platform_subsidy`). See the pricing specification.

### How it is paid out
- The earning is recorded with the payment (`bin_payments.collector_share`).
  A payment record is only for the collector's own bin and is never worth more
  than the booked payout. Its amounts can't be changed once written.
- A cash-out pays each disposed bin at most its booked payout, however many
  payment records it has (`td_withdrawable_items`, part A). Promotional top-ups
  for cash payments are part D.
- Cash-outs list their items on the server (`withdrawal_items`); the app
  can't add its own.

### Illegal dumping cleanups

- The collector earns the cleanup fee, or by default GH₵5–20 by size, ×1.5 when
  severity is high; volunteer groups earn nothing (`td_cleanup_payment`).
- **Only an admin or an MMDA (authority) account sets a cleanup fee**
  (`dumping.fee`; enforced by `td_guard_cleanup_fee`). Managers assign
  without a fee.
- **Who pays** is stamped when the cleanup is assigned
  (`illegal_dumping_mobile.fee_paid_by`): `mmda` when an MMDA account or its
  team assigns it, otherwise `trashdrop`.
- A disposed cleanup TrashDrop pays is cashable (`td_withdrawable_items`,
  part C). A cleanup an MMDA assigned is paid by the MMDA to the team
  directly; TrashDrop only records it and it is never cashable here, until
  MMDA-funded accounts exist. The collector app shows it separately.
- What the collector is shown at disposal (owner's decisions, 2026-11-12):
  a client MoMo payment still pending (or initiated) shows the expected payout
  marked "pending until the client's MoMo payment is confirmed"; a failed one
  shows GH₵0 and "payment failed"; a bin with no readable payment record shows
  GH₵0. This is what is shown, not what is paid.
- A cash-out counts a MoMo/e-Cash payment only once it is **confirmed by the
  payment gateway or an admin** (`td_withdrawable_items` part A,
  `bin_payments.confirmed_by`; owner's decision 2026-11-12, TD53). The
  database records who confirmed each payment; nobody can set it. A
  collector's own "Client has paid — Confirm" marks the payment confirmed in
  the app but doesn't make it cashable. The gateway's result always counts:
  the webhook and the server's own status check (`trendipay-proxy`) update
  payments the collector confirmed, and can fail them. Collectors can't
  change a failed or confirmed payment.

## Who works it out

The database, at every step (since 2026-11-12, TD3):

| Step | How |
|---|---|
| Booked payout (ceiling) | Priced when the bin is booked (`td_price_digital_bin`) |
| Travel distance | Recorded when a collector takes the bin (`td_record_bin_acceptance`): straight-line distance from the collector's reported position to the bin, if that position is **under 15 minutes old**. Otherwise unknown, which pays **87%** (owner's decision 2026-11-12, to revisit with data). Collectors can't set it |
| Collector's share | Set when the payment is recorded (`td_bin_collector_share`, applied by `td_guard_bin_payment`), from what the client paid, never above the bin's fee or the booked payout. The app's own figures are ignored |
| Cash-out | `td_withdrawable_items` |

### What the collector app shows (owner-approved 2026-11-13)
The app shows the database's figure everywhere, never more:
- **Job card** (standard bins): "What you earn", by the rule above from the
  bin's fee, at the distance recorded when the bin was accepted; before that,
  the collector's current straight-line distance to the bin (what the database
  records if they accept now); unknown, 87%. Never the client's whole fee and
  never the booked payout (that is the ceiling, not the earning).
- **Disposal**: the same figure from what the client paid (counted up to the
  fee), never above the booked payout, plus confirmed tips. The pending and
  failed MoMo display below still applies.
- **Earnings**: each bin's recorded share (`bin_payments.collector_share`),
  split into base and urgent parts; not the payout columns stored on the bin.

There is **no loyalty cashback, distance bonus or surge share** on digital
bins. Until 2026-11-13 the app showed a 1% cashback (and could show distance
and surge bonuses) that nothing paid; cash-outs were never affected. The app
works the figure out with `computeBinPaymentShares` and
`src/utils/binEarnings.js`, pinned to the production function by
`disposalPayout.matchesDatabase.test.js`.

**Watch the 87% default.** A bin within 2 km earns 85%, an unknown distance
87%, so turning location off pays slightly more on nearby bins. The monthly
report shows how often the distance is unknown
(`trashdrop/supabase/diagnostics/collector_payout_check.sql`); if it is often,
bring the default back to the owner.

### Pickup requests with prepaid bags (owner-approved 2026-11-13)
When a household has bought bags in advance, the collector earns **100% of the
scanned bags' unit prices, plus tips**, and TrashDrop takes nothing from the
job: the database records the collector's payout and TrashDrop's share (0) when
the bags are scanned (`td_apply_prepaid_bag_payout`, `platform_share`). The
collector app's Earnings page shows both as recorded, so they never add up to
more than the job (`calculatePlatformEarnings`, pinned by
`earningsPickupRequests.test.js`). Until 2026-11-13 the page would have counted
the fee less GH₵1 as TrashDrop's as well; no prepaid pickup had happened.

## Decisions

| Date | Decision |
|---|---|
| 2026-10-24 | Promotional payouts and the cash top-up (pricing specification) |
| 2026-11-12 | Payment records and cash-outs capped at the booked payout (approved "with caution") |
| 2026-11-12 | Collectors can't change a bin's booked price or payout |
| 2026-11-12 | The payout rule is the distance-based split above, not the whole booked payout; the database will work it out (TD3) |
| 2026-11-12 | The database works out the distance and the share (`20261112120016`); unknown distance pays 87% |
| 2026-11-12 | Collectors keep "Client has paid — Confirm" for MoMo payments |
| 2026-11-12 | Cash-outs count only MoMo payments confirmed by the gateway or an admin; a collector's own confirmation doesn't (TD53, `20261112154512`) |
| 2026-11-12 | At disposal: pending MoMo shows the expected payout marked pending; failed shows GH₵0 "payment failed"; no payment record shows GH₵0 |
| 2026-11-12 | Cleanup fees are set only by an admin or the MMDA; cleanups an MMDA assigns are paid by the MMDA and only recorded on TrashDrop, until MMDA-funded accounts exist (admin `20261118_mmda_paid_cleanups.sql`, applied as `20261112170602`) |
| 2026-11-13 | The collector app shows the database's figure on the job card, at disposal and in Earnings; no loyalty cashback, distance bonus or surge share on digital bins (collector #94) |
| 2026-11-13 | Prepaid-bag pickup requests: the Earnings page counts as TrashDrop's only what the database recorded (0), so the collector's 100% and TrashDrop's share add up to the job (TD64) |

## Where it lives

- Database (collector repository `supabase/migrations/`):
  `td_keep_booked_payout` and its trigger (`20261112113921`),
  `td_record_bin_acceptance` and its trigger, `td_bin_collector_share`,
  `td_guard_bin_payment` (`20261112120016`) and its trigger,
  `td_withdrawable_items` (`20261112100533`).
- Check (read-only, monthly report): household
  `trashdrop/supabase/diagnostics/collector_payout_check.sql`.
- Collector app: `src/utils/paymentCalculations.js`
  (`getDeadheadShare`, `computeBinPaymentShares`, `promotionalPayout`,
  `computePromotionalShares`), `src/services/paymentService.js`,
  `src/services/disposalService.js`, `src/services/earningsService.js`.
- Tests (collector app): `src/services/__tests__/disposalPayout.matchesDatabase.test.js`, `src/utils/__tests__/binEarnings.test.js`, `src/utils/__tests__/promotionalPayout.test.js`,
  `src/services/__tests__/earningsPromotional.test.js`,
  `src/services/__tests__/earningsLoyaltyTier.test.js` (the Earnings page's
  loyalty tier: Silver when there is no row for the month; read with
  `maybeSingle()` so "no row" is not an error in the logs, approved
  2026-11-12; nothing it shows changed).
- The daily security watch fingerprints the database objects above.
