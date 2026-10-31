-- Illegal dumping reports: accept "plastic" as a waste type.
--
-- The household app's Report Illegal Dumping form adds a Plastic choice
-- (waste_type = 'plastic'). This makes sure the database accepts it, however
-- waste_type is limited in production:
--   - an enum type: 'plastic' is added to it;
--   - a CHECK constraint listing the allowed values (waste_type IN (...) or
--     = ANY (ARRAY[...])): it is replaced, under the same name, by the same
--     list plus 'plastic';
--   - plain text with no such constraint (as the repository's schema has it):
--     nothing to change.
-- A CHECK constraint of any other shape stops the migration with a message
-- and changes nothing, so it can be looked at first.
--
-- No rows are created or changed. Safe to re-run: once 'plastic' is allowed
-- it does nothing. One transaction.
-- Run the preflight first and keep its output:
--   trashdrop/supabase/diagnostics/dumping_waste_type_plastic_preflight.sql
-- Undo: trashdrop/supabase/diagnostics/dumping_waste_type_plastic_rollback.sql

BEGIN;

DO $$
DECLARE
  col_type regtype;
  con record;
  vals text[];
  rest text;
  changed boolean := false;
BEGIN
  SELECT a.atttypid::regtype INTO col_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.illegal_dumping_mobile'::regclass AND a.attname = 'waste_type' AND NOT a.attisdropped;
  IF col_type IS NULL THEN
    RAISE EXCEPTION 'public.illegal_dumping_mobile has no waste_type column; nothing changed';
  END IF;

  -- An enum type: add the value
  IF EXISTS (SELECT 1 FROM pg_type WHERE oid = col_type AND typtype = 'e') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = col_type AND enumlabel = 'plastic') THEN
      EXECUTE format('ALTER TYPE %s ADD VALUE %L', col_type, 'plastic');
      RAISE NOTICE 'Added plastic to enum %', col_type;
      changed := true;
    END IF;
  END IF;

  -- CHECK constraints that mention waste_type
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.illegal_dumping_mobile'::regclass AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~ '\mwaste_type\M'
  LOOP
    IF con.def ~ '''plastic''' THEN
      CONTINUE;
    END IF;
    -- Only a plain list of allowed values is rewritten: with the quoted
    -- values, waste_type, casts, = ANY / IN / ARRAY and brackets taken out,
    -- nothing may be left
    rest := regexp_replace(con.def, '''[^'']*''(::[a-z ]+)?', '', 'g');
    rest := regexp_replace(rest, 'CHECK|waste_type|::text\[\]|::text|= ANY|ARRAY|\mIN\M|[()\[\],[:space:]]', '', 'g');
    IF rest <> '' THEN
      RAISE EXCEPTION 'Constraint % is not a plain list of waste types (%); nothing changed', con.conname, con.def;
    END IF;
    SELECT array_agg(m[1] ORDER BY ord) INTO vals
      FROM regexp_matches(con.def, '''([^'']*)''', 'g') WITH ORDINALITY AS t(m, ord);
    vals := array_append(vals, 'plastic');
    EXECUTE format('ALTER TABLE public.illegal_dumping_mobile DROP CONSTRAINT %I', con.conname);
    -- Written as ARRAY['a', 'b'] so it reads back with each value quoted
    EXECUTE format('ALTER TABLE public.illegal_dumping_mobile ADD CONSTRAINT %I CHECK (waste_type::text = ANY (ARRAY[%s]))',
      con.conname, (SELECT string_agg(quote_literal(v), ', ') FROM unnest(vals) AS v));
    RAISE NOTICE 'Constraint % now allows: %', con.conname, array_to_string(vals, ', ');
    changed := true;
  END LOOP;

  IF NOT changed THEN
    RAISE NOTICE 'waste_type already accepts plastic; nothing to change';
  END IF;
END $$;

COMMIT;
