Monthly backup restore test ([Backup and recovery policy](../policies/backup-and-recovery.md)).

Restore into **staging only**. Never into production.

- [ ] Latest production backup identified (date/time): ____
- [ ] Restored into the staging project (method used): ____
- [ ] Restore started ____ and finished ____ (minutes: ____; RTO target 4 h)
- [ ] Row counts match production for `profiles`, `pickup_requests`, `digital_bins`, `bin_payments`, `batches`, `bags`, `illegal_dumping_mobile` (±1 day of activity)
- [ ] Household app (preview) signs in against the restored data with a test account
- [ ] Weekly logical dump present, encrypted and in company storage
- [ ] Staging data re-anonymised / restored to synthetic afterwards
- [ ] Problems found, each opened as an issue: ____

Result: pass / fail, and the data loss window (RPO) achieved: ____
