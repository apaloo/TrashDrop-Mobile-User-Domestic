-- Function public.td_bin_reminder_details
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_bin_reminder_details(p_reminder_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_bin_reminder_details(p_reminder_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(reminder_id uuid, plan_id uuid, due_date date, frequency text, preferred_time text, location_id uuid, location_name text, address text, latitude double precision, longitude double precision, bin_size_liters integer, waste_type text, bag_count integer, notes text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.id, p.id, r.due_date, p.frequency, p.preferred_time,
         p.location_id, l.location_name, l.address,
         public.st_y(l.coordinates), public.st_x(l.coordinates),
         p.bin_size_liters, p.waste_type, p.bag_count, p.notes
    from public.bin_reminders r
    join public.bin_reminder_plans p on p.id = r.plan_id
    left join public.bin_locations l on l.id = p.location_id
   where r.user_id = auth.uid()
     and r.status = 'pending'
     and p.status = 'active'
     and r.due_date >= public.td_today_accra()
     and (p_reminder_id is null or r.id = p_reminder_id)
   order by r.due_date, r.created_at
   limit 1;
$function$;
