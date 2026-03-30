-- Check digital_bins table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'digital_bins' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check for triggers on digital_bins table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_condition,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'digital_bins'
AND trigger_schema = 'public';

-- Check constraints on digital_bins table
SELECT 
    constraint_name,
    constraint_type,
    check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'digital_bins'
AND tc.table_schema = 'public';
