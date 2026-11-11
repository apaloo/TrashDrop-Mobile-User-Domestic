# TrashDrop Onboarding Flow - RPC Function Mapping

## Overview
This document provides a comprehensive mapping of user interactions to RPC functions in the TrashDrop onboarding system, based on reverse engineering the actual implementation.

## Step-by-Step Mapping Table

| User Action | RPC Function | Purpose | Dependencies | Data Flow |
|-------------|-------------|---------|--------------|-----------|
| **1. App Launch / Onboarding Check** | `get_user_onboarding_state` | Determines if user should see onboarding and current state | None | Reads from `locations`, `user_stats`, `user_activity` tables |
| **2. Start Onboarding** | `start_onboarding` | Tracks onboarding initiation in activity log | User authentication | Inserts into `user_activity` table |
| **3. "Do you have bags?" - Yes** | `set_has_bags` | Records user selection and determines next step | Step 2 completed | Inserts into `user_activity`, returns next step |
| **4. "Do you have bags?" - No** | `set_has_bags` | Records user selection and determines next step | Step 2 completed | Inserts into `user_activity`, returns next step |
| **5. Add Location (GPS)** | `add_user_location` | Creates location with PostGIS coordinates | Step 3 or 4 completed | Inserts into `locations` table with PostGIS geometry |
| **6. Add Location (Manual)** | `add_user_location` | Creates location with default coordinates | Step 3 or 4 completed | Inserts into `locations` table with fallback coordinates |
| **7. Scan QR Code** | `process_qr_scan` | Activates batch and updates user stats | Step 5 completed, has bags | Updates `batches` table, updates `user_stats` |
| **8. Create Digital Bin** | `create_digital_bin` | Creates digital bin service | no bags | Inserts into `digital_bins`,`bin_locations` table with 7-day expiration |
| **9. Request Pickup** | `create_onboarding_pickup` | Creates pickup request for scanned bags | Step 7 completed | Inserts into `pickup_requests` table using location data |
| **10. Get Has Bags Selection** | `get_user_has_bags_selection` | Retrieves user's previous bags selection | None | Reads from `user_activity` table |

## RPC Function Details

### 1. `start_onboarding(user_uuid UUID)`
- **Purpose**: Logs onboarding initiation
- **Table**: `user_activity`
- **Returns**: JSON `{status: 'started'}`
- **Used in**: OnboardingFlow initialization

### 2. `set_has_bags(user_uuid UUID, has_bags BOOLEAN)`
- **Purpose**: Records user's bag availability selection
- **Table**: `user_activity`
- **Returns**: JSON `{next_step: 'location' | 'choose_service'}`
- **Activity Types**: `'has_bags_true'` or `'has_bags_false'`

### 3. `add_user_location(user_uuid UUID, name TEXT, address TEXT, lat NUMERIC, lng NUMERIC)`
- **Purpose**: Creates user location with PostGIS coordinates
- **Table**: `locations`
- **Returns**: Location UUID
- **Coordinates**: Stored as PostGIS `GEOMETRY(Point, 4326)`
- **Special**: Uses `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` for proper coordinate handling

### 4. `process_qr_scan(user_uuid UUID, qr TEXT)`
- **Purpose**: Activates batch and updates user statistics
- **Tables**: `batches`, `user_stats`
- **Returns**: JSON `{status: 'success', bag_count: N}`
- **Logic**: 
  - Validates QR code exists and is 'pending'
  - Updates batch status to 'used'
  - Increments user's total_batches and total_bags

### 5. `create_digital_bin(user_uuid UUID, location_id UUID)`
- **Purpose**: Creates digital bin service
- **Table**: `digital_bins`, `bin_locations`
- **Returns**: Digital bin UUID
- **Features**: 
  - Generates QR code URL
  - 7-day expiration
  - Status set to 'available'

### 6. `get_user_onboarding_state(user_uuid UUID)`
- **Purpose**: Calculates user's current onboarding state
- **Tables**: `bin_locations`, `user_stats`, `user_activity`
- **Returns**: JSON with state, available_bags, total_bags_scanned, location_count
- **State Logic**:
  - `READY_FOR_PICKUP`: total_bags_scanned > 0
  - `LOCATION_SET`: location_count > 0 but no bags
  - `NEW_USER`: No locations or bags

### 7. `create_onboarding_pickup(user_uuid UUID, location_id UUID, bag_count INTEGER)`
- **Purpose**: Creates pickup request for onboarding completion
- **Table**: `pickup_requests`
- **Returns**: JSON `{status: 'success', pickup_id: UUID}`
- **Features**: Uses PostGIS coordinates from bin_locations

### 8. `get_user_has_bags_selection(user_uuid UUID)`
- **Purpose**: Retrieves user's most recent "has bags" selection
- **Table**: `user_activity`
- **Returns**: JSON with has_bags boolean, selection_made flag, timestamp

## Onboarding Flow Paths

### Path A: User Has Bags
1. `start_onboarding` → 
2. `set_has_bags(true)` → 
3. `add_user_location` → 
4. `process_qr_scan` → 
5. `create_onboarding_pickup` → 
6. Complete

### Path B: User No Bags (Digital Bin)
1. `start_onboarding` → 
2. `set_has_bags(false)` → 
3. `create_digital_bin` → 
4. Complete

### Path C: User No Bags (Other Services)
1. `start_onboarding` → 
2. `set_has_bags(false)` → 
3. Navigate to external services (no additional RPC calls)

## Database Schema Alignment

### Primary Tables Used
- **`locations`**: User locations with PostGIS coordinates
- **`user_stats`**: Tracks total bags and batches per user
- **`batches`**: QR code activation and status tracking
- **`digital_bins`**: Digital bin service records
- **`bin_locations`**: Bin location associations
- **`pickup_requests`**: Pickup request creation
- **`user_activity`**: Audit trail of all user actions

### Key Schema Features
- PostGIS integration for geographic data
- UUID-based primary keys
- RLS (Row Level Security) enabled
- Proper foreign key relationships
- Timestamp tracking with updated_at triggers

## Implementation Corrections Made

### 1. **Table Standardization**
- **Changed**: All RPC functions now use `locations` table for user location data
- **Updated**: `add_user_location`, `get_user_onboarding_state`, `create_onboarding_pickup`
- **Result**: Eliminated confusion between `bin_locations` and `locations` tables

### 2. **Digital Bin Flow Simplification**
- **Removed**: Fee parameter from `create_digital_bin` function
- **Updated**: Frontend to no longer require location for digital bin creation
- **Result**: Streamlined Path B flow (No bags → Digital bin)

### 3. **Service Layer Updates**
- **Updated**: `onboardingService.js` to match corrected RPC signatures
- **Removed**: Fee parameter from `createDigitalBin` method
- **Result**: Consistent API between frontend and backend

### 4. **Component Alignment**
- **Updated**: `OnboardingFlow.js` to handle simplified digital bin creation
- **Removed**: Location dependency for digital bin step
- **Result**: Cleaner user experience with fewer steps

## Gaps and Inconsistencies

### 1. **Redundant State Calculation**
- **Issue**: `onboardingService.js` has fallback manual state calculation that duplicates RPC logic
- **Impact**: Potential inconsistencies between RPC and client-side calculations
- **Recommendation**: Remove client-side fallback, rely entirely on RPC

### 2. **Mixed Location Tables** ✅ RESOLVED
- **Issue**: Code references both `bin_locations` and `locations` tables
- **Impact**: Confusion in data retrieval, potential for data fragmentation
- **Resolution**: Standardized on `locations` table for user locations, `bin_locations` for bin associations only

### 3. **LocalStorage Dependencies**
- **Issue**: Heavy reliance on localStorage for state persistence
- **Impact**: State can become out of sync with database
- **Recommendation**: Use localStorage only for temporary UI state, not core data

### 4. **Missing Error Handling**
- **Issue**: Some RPC functions lack comprehensive error handling
- **Impact**: Poor user experience when database operations fail
- **Recommendation**: Add proper error messages and fallback states

### 5. **Inconsistent Coordinate Handling**
- **Issue**: Some functions use (lat, lng) while others use (lng, lat)
- **Impact**: Potential for coordinate transposition errors
- **Recommendation**: Standardize on (longitude, latitude) order per PostGIS conventions

## Security Considerations

### RLS Policies
- All tables have proper Row Level Security
- Users can only access their own data
- RPC functions use `SECURITY DEFINER` with proper permissions

### Input Validation
- RPC functions validate inputs but could be enhanced
- QR code validation prevents duplicate activation
- Coordinate validation prevents invalid geography data

## Performance Optimizations

### Indexes Present
- `idx_bin_locations_user_id`
- `idx_batches_status`
- `idx_user_stats_user_id`
- `idx_user_activity_user_id`

### Recommended Additional Indexes
- `idx_batches_created_by` (for user's batch history)
- `idx_digital_bins_user_id` (for user's digital bins)
- `idx_pickup_requests_user_id` (for user's pickup history)

## Testing Recommendations

### Unit Tests Needed
- Each RPC function with various input scenarios
- State calculation edge cases
- Error handling paths

### Integration Tests Needed
- Complete onboarding flow for each path
- Network failure scenarios
- Concurrent user scenarios

## Summary

The TrashDrop onboarding system uses a well-structured set of RPC functions that properly map to user interactions. The core functionality is solid with proper database integration and PostGIS support. The main areas for improvement are:

1. **Eliminate redundant client-side logic**
2. **Standardize on single location table**
3. **Reduce localStorage dependencies**
4. **Improve error handling**
5. **Standardize coordinate ordering**

The RPC functions align well with the database schema and provide a solid foundation for the onboarding experience.
