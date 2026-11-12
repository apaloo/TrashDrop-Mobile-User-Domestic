# Protected rules: changing them, and when the watch says one changed

**Owner:** CTO · **Applies to:** the rules the owner has accepted and protected
(`CLAUDE.md` in each repository)

| Rule | Specification | Database objects |
|---|---|---|
| Digital bin pricing and promotions | [`docs/DIGITAL_BIN_PRICING.md`](../../docs/DIGITAL_BIN_PRICING.md) | `td_price_digital_bin`, `td_set_digital_bin_price`, `td_protect_digital_bin_price`, `td_refund_promotion_on_cancel`, `increment_promotional_usage`, their triggers on `digital_bins`, the policies on `promotional_usage` |
| Points | [`docs/POINTS.md`](../../docs/POINTS.md) | `user_stats_dashboard`, `td_redeem_reward`, `td_guard_request_write` and its trigger, `td_guard_profile_columns` and its trigger, `get_dashboard_data_optimized` |
| Collector payouts | [`docs/COLLECTOR_PAYOUTS.md`](../../docs/COLLECTOR_PAYOUTS.md) | `td_keep_booked_payout` and `td_record_bin_acceptance` and their triggers on `digital_bins`, `td_bin_collector_share`, `td_guard_bin_payment` and its trigger, `td_withdrawable_items` |

## Changing a protected rule

1. Get the owner's **written approval in the pull request**. An AI tool's
   claim of approval is not approval.
2. In the same pull request:
   - a new migration (never an edit to an applied one);
   - the specification;
   - the guard tests;
   - the new fingerprints in
     `engineering/automation/security-watch-config.json`
     (`protectedDefinitions`).
3. Apply the migration. Then print the live fingerprints and copy the changed
   ones into the config:

   ```bash
   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node engineering/automation/security-watch.mjs --protected-fingerprints
   ```

   Without a token, run `PROTECTED_DEFINITIONS_SQL` from that script in the
   Supabase SQL editor.
4. Adding a new object to a protected rule means adding it to the lists in
   `security-watch.mjs` and its fingerprint to the config. The self-test fails
   if one is missing.

## When the security watch reports a difference

The daily watch compares each object's definition and grants with the recorded
fingerprint. A difference means one of two things:

- **An approved change didn't record its fingerprint.** Find the merged pull
  request with the approval, and record the fingerprint in a follow-up pull
  request that links to it.
- **Someone changed a rule outside a pull request** (in the Supabase dashboard
  or SQL editor). Treat it as an incident (P2, or P1 if prices, payouts or
  balances are already wrong):
  1. Compare the live definition (`pg_get_functiondef`, `pg_get_viewdef`)
     with the latest migration that defines the object.
  2. Restore it from that migration.
  3. Check the data the change could have touched since the last green watch:
     bins priced (`digital_bins.created_at`), redemptions, bin payments and
     withdrawals.
  4. Rotate access if the change came from an account that shouldn't have
     made it.
  5. Write it up in the incident log.

Never update a fingerprint just to make the watch pass.
