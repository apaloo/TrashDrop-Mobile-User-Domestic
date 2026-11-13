-- Drop 11 duplicate indexes (TD20, 2026-11-13).
--
-- Each index below has an identical twin on the same table: same access
-- method, columns, sort order and predicate. A duplicate never speeds up a
-- read (the planner uses either twin) but every insert and update writes both.
-- The twin that is kept is the one backing a unique or primary-key
-- constraint, or a unique index; between two plain indexes, the one the
-- planner actually uses.
--
-- Not touched: promotional_usage (idx_promotional_usage_user_id duplicates
-- uq_promotional_usage_user) is under the protected pricing rules; it is
-- left for an approved pricing change.
--
-- Guard: before dropping, each index must still exist with a twin whose
-- definition is identical apart from the name; otherwise nothing is dropped.
do $$
declare
  pair text[];
  pairs text[][] := array[
    -- [drop, keep]
    ['illegal_dumping_mobile_user_time_idx',    'idx_illegal_dumping_reporter_created'],
    ['idx_service_areas_name',                  'service_areas_name_key'],
    ['idx_collector_sessions_collector_id',     'collector_sessions_collector_id_key'],
    ['idx_loyalty_tiers_collector',             'collector_loyalty_tiers_collector_id_month_key'],
    ['idx_logs_created_at',                     'logs_created_idx'],
    ['idx_user_stats_user_id',                  'user_stats_user_id_unique'],
    ['idx_collector_profiles_current_location', 'idx_collector_profiles_location'],
    ['idx_collector_profiles_region',           'idx_collector_profiles_assigned_region'],
    ['idx_collector_profiles_user_id',          'collector_profiles_user_id_key'],
    ['idx_whatsapp_users_phone',                'whatsapp_users_phone_key'],
    ['idx_user_stats_aggregated_user_id',       'idx_user_stats_aggregated_user_id_unique']
  ];
  d text; k text;
begin
  foreach pair slice 1 in array pairs loop
    select regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX \S+ ', '')
      into d from pg_index i where i.indexrelid = to_regclass('public.' || pair[1]);
    select regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX \S+ ', '')
      into k from pg_index i where i.indexrelid = to_regclass('public.' || pair[2]);
    if d is null or k is null or d <> k then
      raise exception 'duplicate index check failed for % / %: % vs %', pair[1], pair[2], d, k;
    end if;
    if exists (select 1 from pg_constraint where conindid = to_regclass('public.' || pair[1])) then
      raise exception '% backs a constraint; not dropped', pair[1];
    end if;
  end loop;

  foreach pair slice 1 in array pairs loop
    execute format('drop index public.%I', pair[1]);
  end loop;
end $$;
