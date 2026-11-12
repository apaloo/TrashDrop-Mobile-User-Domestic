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

## Where it is worked out today, and where it is going

| Step | Today | Decided direction (TD3) |
|---|---|---|
| Booked payout (ceiling) | Database at booking | Unchanged |
| Travel distance | Collector app, from the phone's location when the collector accepts | Database, from the collector's last reported location and the bin's location |
| Collector's share | Collector app when the payment is recorded (`computeBinPaymentShares`), capped by the database at the booked payout | Database, when the bin is disposed |
| Cash-out | Database | Unchanged |

Until the database works out the share itself, the cap at the booked payout is
what protects TrashDrop: a wrong distance can move a collector's share between
85% and 92% of the base, never above the booked payout.

## Decisions

| Date | Decision |
|---|---|
| 2026-10-24 | Promotional payouts and the cash top-up (pricing specification) |
| 2026-11-12 | Payment records and cash-outs capped at the booked payout (approved "with caution") |
| 2026-11-12 | Collectors can't change a bin's booked price or payout |
| 2026-11-12 | The payout rule is the distance-based split above, not the whole booked payout; the database will work it out (TD3) |
| 2026-11-12 | Collectors keep "Client has paid — Confirm" for MoMo payments |

## Where it lives

- Database (collector repository `supabase/migrations/`):
  `td_keep_booked_payout` and its trigger (`20261112113921`),
  `td_guard_bin_payment` and its trigger, `td_withdrawable_items`
  (`20261112100533`).
- Collector app: `src/utils/paymentCalculations.js`
  (`getDeadheadShare`, `computeBinPaymentShares`, `promotionalPayout`,
  `computePromotionalShares`), `src/services/paymentService.js`,
  `src/services/disposalService.js`, `src/services/earningsService.js`.
- Tests (collector app): `src/utils/__tests__/promotionalPayout.test.js`,
  `src/services/__tests__/earningsPromotional.test.js`.
- The daily security watch fingerprints the database objects above.
