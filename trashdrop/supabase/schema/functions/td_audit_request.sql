-- Function public.td_audit_request
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_audit_request(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_audit_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  n jsonb := to_jsonb(NEW);
  old_col text := coalesce(o ->> 'collector_id', o ->> 'assigned_to');
  new_col text := coalesce(n ->> 'collector_id', n ->> 'assigned_to');
  old_s text := public.td_canon_status(o ->> 'status');
  new_s text := public.td_canon_status(n ->> 'status');
  old_fee text := o ->> 'fee';
  new_fee text := n ->> 'fee';
  old_pt text;
  new_pt text;
  col_name text;
  col_profile text;
  old_name text;
  reason text := n ->> 'cancellation_reason';
  dup_of text;
  act text;
  msg text;
  short text := left(NEW.id::text, 8);
  meta jsonb;
BEGIN
  BEGIN
    SELECT nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), c.id::text INTO col_name, col_profile
    FROM public.collector_profiles c WHERE new_col IS NOT NULL AND (c.user_id::text = new_col OR c.id::text = new_col) LIMIT 1;
    meta := jsonb_strip_nulls(jsonb_build_object('table', TG_TABLE_NAME, 'collector_id', new_col, 'collector_profile_id', col_profile));

    -- created
    IF TG_OP = 'INSERT' THEN
      PERFORM public.td_write_log('info', 'requests', 'request.created', 'pickup_request', NEW.id::text,
        format('Request #%s created%s', short, coalesce(' at ' || left(n ->> 'address', 120), '')),
        NULL,
        jsonb_strip_nulls(jsonb_build_object('status', n ->> 'status', 'fee', new_fee, 'address', n ->> 'address',
          'location', public.td_point_text(n), 'collector', CASE WHEN new_col IS NOT NULL THEN coalesce(col_name, new_col) END)),
        meta);
      RETURN NEW;
    END IF;

    -- status and / or collector
    IF old_s IS DISTINCT FROM new_s OR old_col IS DISTINCT FROM new_col THEN
      SELECT nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '') INTO old_name
      FROM public.collector_profiles c WHERE old_col IS NOT NULL AND (c.user_id::text = old_col OR c.id::text = old_col) LIMIT 1;

      IF old_col IS DISTINCT FROM new_col AND (old_s IS NOT DISTINCT FROM new_s OR new_s = 'accepted') THEN
        act := CASE WHEN old_col IS NULL THEN 'request.assigned' WHEN new_col IS NULL THEN 'request.unassigned' ELSE 'request.reassigned' END;
        msg := CASE WHEN new_col IS NULL THEN format('Request #%s unassigned', short)
                    ELSE format('Request #%s %s to %s', short, CASE WHEN old_col IS NULL THEN 'assigned' ELSE 'reassigned' END, coalesce(col_name, new_col)) END;
      ELSIF new_s = 'cancelled' AND reason ILIKE 'duplicate%' THEN
        -- "Merge" on the Pickup Requests page cancels the copy with this reason
        act := 'request.merged';
        dup_of := substring(reason FROM '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}');
        msg := format('Request #%s merged: cancelled as a duplicate%s', short, coalesce(' of #' || left(dup_of, 8), ''));
      ELSE
        act := CASE new_s
          WHEN 'accepted' THEN 'request.accepted' WHEN 'en_route' THEN 'request.started' WHEN 'arrived' THEN 'request.arrived'
          WHEN 'collecting' THEN 'request.collecting' WHEN 'disposed' THEN 'request.completed' WHEN 'cancelled' THEN 'request.cancelled'
          WHEN 'expired' THEN 'request.expired' WHEN 'pending' THEN 'request.reopened' ELSE 'request.status_changed' END;
        msg := format('Request #%s: %s → %s', short, coalesce(o ->> 'status', '?'), coalesce(n ->> 'status', '?'))
               || CASE WHEN new_s = 'cancelled' THEN coalesce(' (' || reason || ')', '') ELSE '' END;
      END IF;

      PERFORM public.td_write_log(
        CASE WHEN new_s = 'cancelled' THEN 'warn' ELSE 'info' END, 'requests', act, 'pickup_request', NEW.id::text, msg,
        -- collector shown by name, and only when it changed; ids stay in metadata
        jsonb_strip_nulls(jsonb_build_object('status', CASE WHEN old_s IS DISTINCT FROM new_s THEN o ->> 'status' END,
          'collector', CASE WHEN old_col IS DISTINCT FROM new_col THEN coalesce(old_name, old_col, '(none)') END)),
        jsonb_strip_nulls(jsonb_build_object('status', CASE WHEN old_s IS DISTINCT FROM new_s THEN n ->> 'status' END,
          'collector', CASE WHEN old_col IS DISTINCT FROM new_col THEN coalesce(col_name, new_col, '(none)') END,
          'cancellation_reason', CASE WHEN new_s = 'cancelled' THEN reason END)),
        meta || jsonb_strip_nulls(jsonb_build_object('previous_collector_id', old_col, 'duplicate_of', dup_of)));
    END IF;

    -- fee
    IF old_fee IS DISTINCT FROM new_fee AND (old_fee IS NULL OR new_fee IS NULL OR old_fee::numeric <> new_fee::numeric) THEN
      PERFORM public.td_write_log('info', 'requests', 'request.fee_changed', 'pickup_request', NEW.id::text,
        format('Request #%s fee GHS %s → GHS %s', short, coalesce(old_fee, '—'), coalesce(new_fee, '—')),
        jsonb_build_object('fee', old_fee), jsonb_build_object('fee', new_fee), meta);
    END IF;

    -- location (point or address)
    IF o -> 'location' IS DISTINCT FROM n -> 'location' OR o -> 'coordinates' IS DISTINCT FROM n -> 'coordinates'
       OR o -> 'latitude' IS DISTINCT FROM n -> 'latitude' OR o -> 'longitude' IS DISTINCT FROM n -> 'longitude'
       OR o -> 'location_id' IS DISTINCT FROM n -> 'location_id' OR o -> 'address' IS DISTINCT FROM n -> 'address' THEN
      old_pt := public.td_point_text(o);
      new_pt := public.td_point_text(n);
      IF old_pt IS DISTINCT FROM new_pt OR o -> 'address' IS DISTINCT FROM n -> 'address' OR o -> 'location_id' IS DISTINCT FROM n -> 'location_id' THEN
        PERFORM public.td_write_log('info', 'requests', 'request.location_fixed', 'pickup_request', NEW.id::text,
          format('Request #%s location changed%s', short, coalesce(': ' || new_pt, '')),
          jsonb_strip_nulls(jsonb_build_object('location', CASE WHEN old_pt IS DISTINCT FROM new_pt THEN coalesce(old_pt, '(none)') END,
            'address', CASE WHEN o -> 'address' IS DISTINCT FROM n -> 'address' THEN o ->> 'address' END)),
          jsonb_strip_nulls(jsonb_build_object('location', CASE WHEN old_pt IS DISTINCT FROM new_pt THEN coalesce(new_pt, '(none)') END,
            'address', CASE WHEN o -> 'address' IS DISTINCT FROM n -> 'address' THEN n ->> 'address' END)),
          meta || jsonb_strip_nulls(jsonb_build_object('location_id', CASE WHEN o -> 'location_id' IS DISTINCT FROM n -> 'location_id' THEN n ->> 'location_id' END)));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- logging never blocks the change
  END;
  RETURN NEW;
END $function$;
