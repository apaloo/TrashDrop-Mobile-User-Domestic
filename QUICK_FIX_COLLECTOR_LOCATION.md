# Quick Fix: Collector Location Sync

## ⚠️ MIGRATION FIXED
The migration has been updated to use `geometry` type instead of `geography` to match your database schema.

## Current Issue
Collector `b602470d-338e-4d65-9e3a-160446bf05eb` (Jack Bhone) has:
- ✅ PostGIS location: `0101000020E610...` (has data in `geometry` format)
- ❌ `current_latitude`: `null`
- ❌ `current_longitude`: `null`
- ❌ `location_updated_at`: `null`

## Immediate SQL Fix (Run Now)

Copy and paste this into your Supabase SQL Editor:

```sql
-- Fix Jack Bhone's location
UPDATE collector_profiles
SET 
  current_latitude = ST_Y(current_location::geometry),
  current_longitude = ST_X(current_location::geometry),
  location_updated_at = NOW()
WHERE 
  user_id = 'b602470d-338e-4d65-9e3a-160446bf05eb'
  AND current_location IS NOT NULL;

-- Verify the fix
SELECT 
  user_id,
  first_name,
  last_name,
  current_latitude,
  current_longitude,
  ST_Y(current_location::geometry) as lat_from_postgis,
  ST_X(current_location::geometry) as lng_from_postgis,
  location_updated_at
FROM collector_profiles
WHERE user_id = 'b602470d-338e-4d65-9e3a-160446bf05eb';
```

**Expected Result:**
```
current_latitude:  5.614736 (approximately, from PostGIS)
current_longitude: -0.208811 (approximately, from PostGIS)
location_updated_at: 2025-12-08 10:12:XX
```

## Full Migration (Apply to All Collectors)

After the quick fix, apply the full migration to prevent future issues:

```bash
# In Supabase SQL Editor, run:
/trashdrop/migrations/13_sync_collector_location_formats.sql
```

This will:
1. ✅ Fix ALL collectors with PostGIS data but null lat/lng
2. ✅ Create triggers to auto-sync location formats
3. ✅ Add spatial indexes for performance
4. ✅ Provide stored procedures for easy updates

## Using the New Service Method

After migration, update locations from your app:

```javascript
import { collectorService } from './services/collectorService';

// Update collector location (both formats synced automatically)
await collectorService.updateCollectorLocation(
  'b602470d-338e-4d65-9e3a-160446bf05eb',
  {
    latitude: 5.614736,
    longitude: -0.208811
  }
);
```

## Testing

Run this query to verify all collectors have synced locations:

```sql
SELECT 
  user_id,
  first_name,
  CASE 
    WHEN current_location IS NOT NULL AND current_latitude IS NOT NULL THEN '✅ Synced'
    WHEN current_location IS NOT NULL AND current_latitude IS NULL THEN '❌ PostGIS only'
    WHEN current_location IS NULL AND current_latitude IS NOT NULL THEN '❌ Lat/Lng only'
    ELSE '❌ No location'
  END as location_status,
  current_latitude,
  current_longitude,
  location_updated_at
FROM collector_profiles
ORDER BY location_status, first_name;
```

## Summary

1. **Quick fix** (1 minute): Run the SQL above to fix Jack Bhone
2. **Full migration** (5 minutes): Apply `13_sync_collector_location_formats.sql`
3. **Test**: Verify locations are synced
4. **Deploy**: Updated code will now maintain sync automatically
