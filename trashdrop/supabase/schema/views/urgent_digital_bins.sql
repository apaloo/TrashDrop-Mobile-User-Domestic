-- View public.urgent_digital_bins
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: service_role

create view public.urgent_digital_bins as
SELECT db.id,
    db.user_id,
    db.location_id,
    db.bin_size_liters,
    db.waste_type,
    db.frequency,
    db.is_urgent,
    db.created_at,
    db.expires_at,
    bl.location_name,
    bl.address
   FROM (digital_bins db
     JOIN bin_locations bl ON ((db.location_id = bl.id)))
  WHERE ((db.is_urgent = true) AND (db.is_active = true) AND (db.expires_at > now()))
  ORDER BY db.created_at;
