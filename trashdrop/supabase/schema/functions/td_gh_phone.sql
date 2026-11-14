-- Function public.td_gh_phone
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_gh_phone(p text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_gh_phone(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p IS NULL OR p ~* '[a-z@]' THEN NULL
    ELSE (
      SELECT CASE WHEN core ~ '^[2-5][0-9]{8}$' THEN '+233' || core END
      FROM (
        SELECT CASE
          WHEN d LIKE '00233%' THEN substr(d, 6)
          WHEN d LIKE '233%'   THEN substr(d, 4)
          WHEN d LIKE '0%'     THEN substr(d, 2)
          WHEN btrim(p) LIKE '+%' THEN NULL
          ELSE d
        END AS core
        FROM (SELECT regexp_replace(p, '\D', '', 'g') AS d) digits
      ) n
    )
  END
$function$;
