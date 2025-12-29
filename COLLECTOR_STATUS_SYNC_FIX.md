# Collector Online Status Sync Fix

## Problem Identified

The collector with ID `b602470d-338e-4d65-9e3a-160446bf05eb` shows:
- ✅ `last_active`: `"2025-12-08 08:36:25.287+00"` (recently updated)
- ❌ `is_online`: `false` (should be `true`)
- ❌ `status`: `"inactive"` (should be `"active"`)

## Root Cause

The `collector_profiles` table has three related fields that were not being synced:
1. **`last_active`** - Timestamp of last activity (being updated)
2. **`is_online`** - Boolean flag (NOT being updated)
3. **`status`** - Status string (NOT being updated)

There was **no mechanism** to automatically sync these fields when `last_active` was updated.

## Solutions Implemented

### Solution 1: Frontend Service Method (Immediate Fix)

Added `updateCollectorStatus()` method to `collectorService.js`:

```javascript
async updateCollectorStatus(collectorId, isOnline, status) {
  const { data, error } = await supabase
    .from('collector_profiles')
    .update({
      is_online: isOnline,
      status: status,
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', collectorId)
    .select()
    .single();
  
  return { data, error: null };
}
```

**Usage:**
```javascript
// When collector goes online
await collectorService.updateCollectorStatus(collectorId, true, 'active');

// When collector goes offline
await collectorService.updateCollectorStatus(collectorId, false, 'inactive');

// From any component
import { collectorService } from '../services/collectorService';
await collectorService.updateCollectorStatus(user.id, true, 'active');
```

### Solution 2: Database Trigger (Automatic Sync)

Created migration `12_sync_collector_online_status.sql` with:

#### Automatic Trigger
- Runs **before** any update to `last_active`
- If `last_active` is within 5 minutes: sets `is_online=true`, `status='active'`
- If `last_active` is older than 5 minutes: sets `is_online=false`, `status='inactive'`

#### Stored Procedure
```sql
SELECT * FROM update_collector_activity('collector-user-id-here');
```
This can be called from the app using:
```javascript
await supabase.rpc('update_collector_activity', { p_user_id: collectorId });
```

#### Immediate Fix for Existing Data
The migration includes queries to fix all existing records:
- Sets online=true for collectors active within last 5 minutes
- Sets online=false for collectors inactive more than 5 minutes

## How to Apply

### Step 1: Apply Database Migration
```bash
# Connect to your Supabase database and run:
psql -U postgres -d your_database -f migrations/12_sync_collector_online_status.sql
```

Or use Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `migrations/12_sync_collector_online_status.sql`
3. Run the migration

### Step 2: Use Updated Service
The `collectorService.js` now automatically calls `updateCollectorStatus()` when:
- Starting a collector session (`startSession()`)
- Ending a collector session (`endActiveSession()`)

### Step 3: Fix Existing Records (One-Time)
If you have collectors stuck in wrong states, run this SQL:

```sql
-- Fix collectors who are actually online
UPDATE collector_profiles
SET 
  is_online = true,
  status = 'active',
  updated_at = NOW()
WHERE 
  last_active > NOW() - INTERVAL '5 minutes'
  AND (is_online = false OR status = 'inactive');
```

## Expected Behavior After Fix

| Scenario | last_active | is_online | status |
|----------|------------|-----------|---------|
| Collector just updated location | < 5 min ago | ✅ `true` | ✅ `active` |
| Collector session active | < 5 min ago | ✅ `true` | ✅ `active` |
| Collector went offline | > 5 min ago | ✅ `false` | ✅ `inactive` |
| Collector session ended | > 5 min ago | ✅ `false` | ✅ `inactive` |

## Testing

### Test the Fix
```javascript
// Import the service
import { collectorService } from './services/collectorService';

// Test updating status
const result = await collectorService.updateCollectorStatus(
  'b602470d-338e-4d65-9e3a-160446bf05eb',
  true,
  'active'
);

console.log('Updated collector:', result.data);
```

### Verify in Database
```sql
SELECT 
  user_id,
  first_name,
  last_name,
  is_online,
  status,
  last_active,
  EXTRACT(EPOCH FROM (NOW() - last_active)) / 60 AS minutes_since_active
FROM collector_profiles
WHERE user_id = 'b602470d-338e-4d65-9e3a-160446bf05eb';
```

## Files Modified

1. ✅ `/trashdrop/src/services/collectorService.js`
   - Added `updateCollectorStatus()` method
   - Added `updateCollectorLocation()` method (populates both lat/lng and PostGIS)
   - Updated `startSession()` to call status update
   - Updated `endActiveSession()` to call status update
   - Updated `updateLocation()` to call `updateCollectorLocation()`

2. ✅ `/trashdrop/migrations/12_sync_collector_online_status.sql`
   - Database trigger for automatic status sync
   - Stored procedure for manual status updates
   - Immediate fix for existing status records

3. ✅ `/trashdrop/migrations/13_sync_collector_location_formats.sql`
   - Bi-directional triggers for PostGIS ↔ lat/lng sync
   - Stored procedure for location updates
   - Fixes existing location records
   - Spatial indexes for performance

4. ✅ `/COLLECTOR_STATUS_SYNC_FIX.md` (this file)
   - Complete documentation of both issues and solutions

## Location Sync Fix (BONUS)

### Problem Identified
Collector location was stored in PostGIS format but `current_latitude`/`current_longitude` were null:
- ✅ `current_location`: `"0101000020E610..."` (PostGIS EWKB)
- ❌ `current_latitude`: `null`
- ❌ `current_longitude`: `null`

### Solution Implemented

1. **Updated `collectorService.js`**: Added `updateCollectorLocation()` method that updates **both** formats:
   ```javascript
   await collectorService.updateCollectorLocation(collectorId, {
     latitude: 5.614736,
     longitude: -0.208811
   });
   ```

2. **Database Triggers** (migration `13_sync_collector_location_formats.sql`):
   - **Bi-directional sync**: Updates PostGIS ↔ lat/lng automatically
   - Updates `location_updated_at` timestamp
   - Updates `last_active` when location changes

3. **Stored Procedure** for direct calls:
   ```sql
   SELECT * FROM update_collector_location(
     'user-id',
     5.614736,  -- latitude
     -0.208811  -- longitude
   );
   ```

### Apply Location Fix
```bash
# Run the location sync migration
psql -U postgres -d your_database -f migrations/13_sync_collector_location_formats.sql
```

## Additional Notes

- **5-minute threshold**: Collectors are considered online if active within last 5 minutes
- **Busy status**: If collector is marked as 'busy', the trigger preserves that status
- **Performance**: Added indexes on `last_active`, `location_updated_at`, and spatial index on `current_location`
- **Real-time updates**: Frontend real-time subscriptions will automatically pick up changes
- **Location sync**: Both PostGIS and lat/lng formats are now kept in sync automatically
