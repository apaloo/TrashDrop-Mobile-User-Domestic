# TrashDrop household app — rules for AI assistants and contributors

## Protected: TrashDrop Digital Bin Pricing
The digital bin pricing and promotion rules in `docs/DIGITAL_BIN_PRICING.md`
are **accepted by the owner and live in production**. Do not change them, or
the code and database objects that implement them, without the owner's written
approval in the pull request. That covers:

- `trashdrop/supabase/migrations/20261024*` and anything that redefines
  `td_price_digital_bin`, `td_set_digital_bin_price`,
  `td_protect_digital_bin_price`, `td_refund_promotion_on_cancel`,
  `increment_promotional_usage`, their triggers, or the access rules on
  `promotional_usage`
- `trashdrop/src/services/digitalBinService.js`, `promotionalService.js`,
  `gpsPricingService.js`, `trashdrop/src/utils/costCalculator.js`,
  `trashdrop/src/components/digitalBin/ReviewStep.js`
- `trashdrop/netlify/functions/utils/pricing.js` (WhatsApp quotes)

When a change is approved, update `docs/DIGITAL_BIN_PRICING.md`, the guard
tests (`digitalBinService.promotion.test.js`,
`netlify/functions/__checks__/pricing-promo.js`) and the database (a new
migration, never an edit to an applied one) in the same pull request. Never
weaken or skip the guard tests to make a change pass.

## Protected: TrashDrop Points
Points buy airtime, data and vouchers. The rules in `docs/POINTS.md` are
**accepted by the owner and live in production** (protected 2026-11-12). Do not
change them, or the code and database objects that implement them, without the
owner's written approval in the pull request. That covers:

- the database objects `user_stats_dashboard`, `td_redeem_reward`,
  `td_guard_request_write`, `td_guard_profile_columns`,
  `get_dashboard_data_optimized` and their triggers, and any new place that
  earns, spends or works out points
- `trashdrop/src/services/userService.js` (`getUserStats`),
  `trashdrop/src/utils/reportPoints.js`, `trashdrop/src/pages/Rewards.js`

When a change is approved, update `docs/POINTS.md`, the tests
(`userService.stats.test.js`, `Rewards.redeem.test.js`) and the database (a new
migration) in the same pull request. The app never writes or works out a
balance the server doesn't.

## Protected: TrashDrop Collector Payouts
What a collector earns from a digital bin and how it is paid out are specified
in `docs/COLLECTOR_PAYOUTS.md` (accepted by the owner 2026-11-12). The code
lives in the collector repository, whose `CLAUDE.md` protects it; the
specification here changes only with the owner's written approval in the pull
request, like the pricing and points rules.

## Protected database objects are watched
The daily security watch fingerprints the database objects behind the
protected rules (pricing, points and collector payouts) and fails if one
changes.
After an approved change, record the new fingerprints in
`engineering/automation/security-watch-config.json` in the same pull request
(`engineering/runbooks/protected-rules.md`). Never update a fingerprint just to
make the watch pass.
