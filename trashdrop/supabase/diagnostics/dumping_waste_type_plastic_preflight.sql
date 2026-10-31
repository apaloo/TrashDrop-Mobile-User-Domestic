-- Read-only checks before running 20261102000000_dumping_waste_type_plastic.sql.
-- Changes nothing. Run in the Supabase SQL editor and keep the output: it is
-- the record of how waste_type is restricted today.

-- 1. The column's type (text, or an enum type whose values limit it)
SELECT data_type, udt_name, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'illegal_dumping_mobile' AND column_name = 'waste_type';

-- 2. Enum values, if it is an enum (no rows if it is text)
SELECT e.enumlabel
  FROM pg_attribute a
  JOIN pg_enum e ON e.enumtypid = a.atttypid
 WHERE a.attrelid = 'public.illegal_dumping_mobile'::regclass AND a.attname = 'waste_type'
 ORDER BY e.enumsortorder;

-- 3. CHECK constraints on the table (any that mention waste_type limit it)
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.illegal_dumping_mobile'::regclass AND contype = 'c';

-- 4. Triggers on the table (one could reject unknown waste types)
SELECT tgname, pg_get_triggerdef(oid) AS definition
  FROM pg_trigger
 WHERE tgrelid = 'public.illegal_dumping_mobile'::regclass AND NOT tgisinternal;

-- 5. Functions that mention both the table and waste_type
SELECT n.nspname AS schema, p.proname AS function
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.prosrc ILIKE '%illegal_dumping%' AND p.prosrc ILIKE '%waste_type%'
   AND n.nspname NOT IN ('pg_catalog', 'information_schema');

-- 6. Waste types in use today
SELECT waste_type, count(*) FROM public.illegal_dumping_mobile GROUP BY waste_type ORDER BY 2 DESC;
