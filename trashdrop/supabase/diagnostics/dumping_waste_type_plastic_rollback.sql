-- Undo trashdrop/supabase/migrations/20261102000000_dumping_waste_type_plastic.sql
--
-- Takes 'plastic' back out of any CHECK constraint on waste_type that the
-- migration widened (same name, same list without 'plastic'). It stops and
-- changes nothing while any report still has waste_type = 'plastic': those
-- reports would break the narrowed constraint, and changing them is a data
-- change that needs the owner's approval first.
-- An enum value cannot be removed in place; if the preflight showed an enum,
-- 'plastic' stays in it (unused by the app once the form change is undone).
-- One transaction.

BEGIN;

DO $$
DECLARE
  con record;
  vals text[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.illegal_dumping_mobile WHERE waste_type::text = 'plastic') THEN
    RAISE EXCEPTION 'Reports with waste_type plastic exist; nothing changed';
  END IF;
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.illegal_dumping_mobile'::regclass AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~ '\mwaste_type\M' AND pg_get_constraintdef(c.oid) ~ '''plastic'''
  LOOP
    SELECT array_agg(m[1] ORDER BY ord) INTO vals
      FROM regexp_matches(con.def, '''([^'']*)''', 'g') WITH ORDINALITY AS t(m, ord)
     WHERE m[1] <> 'plastic';
    EXECUTE format('ALTER TABLE public.illegal_dumping_mobile DROP CONSTRAINT %I', con.conname);
    -- Written as ARRAY['a', 'b'] so it reads back with each value quoted
    EXECUTE format('ALTER TABLE public.illegal_dumping_mobile ADD CONSTRAINT %I CHECK (waste_type::text = ANY (ARRAY[%s]))',
      con.conname, (SELECT string_agg(quote_literal(v), ', ') FROM unnest(vals) AS v));
    RAISE NOTICE 'Constraint % back to: %', con.conname, array_to_string(vals, ', ');
  END LOOP;
END $$;

COMMIT;
