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
