# TrashDrop Points (accepted)

**Status:** accepted by the owner and live in production (rules as of
2026-11-12, including the owner's decisions of that day).
**Protected** since 2026-11-12: points buy airtime, data and vouchers, so these
rules, and the code and database objects that implement them, change only with
the owner's written approval in the pull request (`CLAUDE.md`). If a change is
approved, update this document, the tests, the database (a new migration) and
the recorded fingerprints in the same change
([protected rules runbook](../engineering/runbooks/protected-rules.md)). The
daily security watch fails if a points object changes without that.

## Who decides

The **database** decides every balance. One view, `user_stats_dashboard`,
works out each user's balance (`total_points`), and:

- `td_redeem_reward` checks that balance before it records a redemption;
- `get_dashboard_data_optimized` returns that balance for the dashboard;
- the household app shows that balance (`userService.getUserStats`). Only if
  it can't be read does the app work the figure out itself, with the same
  rules.

The app never writes points. A new pickup request always starts with 0 points
whatever the app sends (`td_guard_request_write`); profile points can only be
changed by the server or staff (`td_guard_profile_columns`).

## How points are earned

| Source | Points | Counts when |
|---|---|---|
| Pickup request | The request's `points_earned`: 0 when created, then the household app may add a one-off **5** (0 → at most 5, once per request) | The request isn't cancelled or rejected |
| Digital bin | **15** per bin | The bin isn't cancelled |
| Illegal dumping report | **20** high, **15** medium, **10** low (15 if not set) | Reports sent from 31 October 2026: once the team has verified it (verified, in progress, completed or disposed). Earlier reports keep the points they had |
| Profile points | Whatever the server or staff set | Always |

## How points are spent

- A reward is redeemed only through `td_redeem_reward`. The server takes the
  reward's `points_cost`, checks the balance, and records the redemption as
  pending. The app never sends a cost or a balance.
- Every redemption that isn't rejected is subtracted. A rejected redemption
  gives its points back.
- Staff send or reject redemptions (`admin_set_redemption_status`, admin site).

## Balance

`total_points` = profile points + pickup request points + digital bin points +
dumping report points − points spent.

## Decisions and corrections

| Date | Decision |
|---|---|
| 2026-10-30 | Dumping reports earn their points once verified (reports sent from 31 October) |
| 2026-11-12 | The server sets points on new pickup requests (0); the app may only add the one-off 5 |
| 2026-11-12 | A cancelled digital bin earns no points (one account: 360 → 315) |
| 2026-11-12 | Two older pickup requests that carried 125 and 126 points, written by an earlier app version, reset to 5 (balances 1,190 → 1,070 and 326 → 205; none went below 0) |
| 2026-11-12 | Redemptions go through `td_redeem_reward` (the server checks cost and balance) |

## Where this lives

- Database: `user_stats_dashboard`, `td_redeem_reward`,
  `td_guard_request_write`, `td_guard_profile_columns`,
  `get_dashboard_data_optimized` (migrations `20261112095056`,
  `20261112110640`, `20261112110931`).
- Household app: `src/services/userService.js` (`getUserStats`),
  `src/utils/reportPoints.js`, `src/pages/Rewards.js`.
- Tests: `userService.stats.test.js`, `Rewards.redeem.test.js`.
