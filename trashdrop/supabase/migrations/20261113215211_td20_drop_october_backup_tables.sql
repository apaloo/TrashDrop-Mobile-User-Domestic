-- TD20 (owner's decision 2026-11-13: save them, then delete them; applied
-- with the owner's "yes, apply to production"). Six copies of tables made in
-- October before database changes; nothing reads them (no view, foreign key
-- or function refers to them, checked first). All their rows were saved the
-- same day and given to the owner (td20-october-backups-2026-11-13.json:
-- bags 192, batches 156 + 156, rewards 3, scans 0, access rules 9). No
-- CASCADE: if anything did depend on one, the drop would fail instead.
drop table public.bags_backup_20261021;
drop table public.batches_backup_20261019;
drop table public.batches_backup_20261021;
drop table public.rewards_backup_20261030;
drop table public.scans_backup_20261020;
drop table public.td_policy_backup_20261027;
