# Available Bags Calculation Feature

**Date**: October 20, 2025  
**Feature**: Dynamic calculation of available bags for pickup requests

---

## 🎯 **Problem Statement**

Previously, the total bag count shown on the "Batches & Bags" card was static and didn't account for bags already requested in pending or scheduled pickups. This led to confusion where users could request more bags than they actually had available.

The goal is to implement a dynamic system that:
1. Shows the actual number of bags available for new pickup requests
2. Accounts for bags already in pending/scheduled pickups
3. Updates in real-time when pickup statuses change
4. Provides clear feedback to users about their available bags

## ⚠️ **CRITICAL: Bag Count Behavior**

**Total Bags (on Dashboard "Batches & Bags" card):**
- Represents **cumulative bags from batches table**
- Sourced from `user_stats.total_bags`
- **NEVER reduces** when pickups are requested
- Only increases when new batches are scanned
- Example: If you scan 5 bags, `total_bags` = 5 permanently

**Available Bags (on Request Pickup page):**
- **Dynamically calculated** as: `availableBags = total_bags - requestedBags`
- NOT stored in database
- Changes based on pending/scheduled pickup requests
- Updates in real-time via Supabase subscriptions
- Example: 5 total bags - 3 requested = 2 available

---

## ✅ **Solution**

Implemented **dynamic available bags calculation** that:
1. **Fetches total bags** from `user_stats` table
2. **Fetches requested bags** from `pickup_requests` table (pending/scheduled status)
3. **Calculates available bags** = Total Bags - Requested Bags (minimum 0)
4. **Updates in real-time** when pickups are created/updated/deleted
5. **Validates** that users can only request bags they have available

---

## 📐 **Calculation Formula**

```javascript
availableBags = Math.max(0, totalBags - requestedBags)

Where:
- totalBags: From user_stats table (scanned bags from batches)
- requestedBags: Sum of bag_count in pickup_requests 
                 with status 'available', 'pending', 'scheduled', 'accepted', or 'in_transit'
                 (excludes: 'completed', 'cancelled', 'disposed')
- availableBags: Cannot go below 0 (protected by Math.max)
```

## ✅ **Correct Behavior**

**Scan 5 bags → Available: 5 bags**
**Request 3 bags → Available: 2 bags** (5 - 3 = 2)

---

## 🔧 **Implementation Details**

### **1. State Management**

```javascript
// Existing state
const [userStats, setUserStats] = useState({ totalBags: 0, batches: 0 });

// NEW: Track bags in active pickups
const [requestedBags, setRequestedBags] = useState(0);

// NEW: Calculate available bags (minimum 0)
const availableBags = Math.max(0, (userStats.totalBags || 0) - (requestedBags || 0));
```

### **2. Fetching Active Pickup Requests**

```javascript
useEffect(() => {
  const fetchRequestedBags = async () => {
    // Fetch all active pickup requests
    const { data: pickupsData } = await supabase
      .from('pickup_requests')
      .select('bag_count')
      .eq('user_id', user.id)
      .in('status', ['available', 'pending', 'scheduled', 'accepted', 'in_transit']);
    
    // Sum up bags from all active pickups
    const totalRequestedBags = pickupsData?.reduce((sum, pickup) => {
      return sum + (pickup.bag_count || 0);
    }, 0) || 0;
    
    setRequestedBags(totalRequestedBags);
  };
  
  fetchRequestedBags();
}, [user?.id]);
```

### **3. Real-time Updates**

```javascript
// Subscribe to pickup_requests changes
const subscription = supabase
  .channel('pickup_requests_changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'pickup_requests', filter: `user_id=eq.${user?.id}` },
    () => {
      fetchRequestedBags(); // Refetch when pickups change
    }
  )
  .subscribe();
```

### **4. Form Validation**

```javascript
// Update validation to use availableBags
const validationSchema = Yup.object().shape({
  numberOfBags: Yup.number()
    .min(1, 'Minimum 1 bag required')
    .max(10, 'Maximum 10 bags allowed')
    .test('enough-bags', function (value) {
      const max = Number(availableBagsRef.current || 0);
      if (value > max) {
        return this.createError({ message: `You only have ${max} bag(s) available` });
      }
      return true;
    })
});
```

### **5. Submit Validation**

```javascript
// Check available bags before submitting
if (availableBags < Number(values.numberOfBags)) {
  throw new Error(
    `You don't have enough bags available. You have ${availableBags} bag(s) available ` +
    `(${userStats.totalBags} total, ${requestedBags} already requested), ` +
    `but you're trying to request ${values.numberOfBags}.`
  );
}
```

---

## 🎨 **UI Updates**

### **1. Main Availability Message**

**Before**:
```jsx
You have 5 bag(s) available for pickup.
```

**After**:
```jsx
You have 3 bag(s) available for pickup.
(5 total bags - 2 already requested = 3 available)
```

### **2. Form Field Label**

**Before**:
```jsx
Number of Bags * (You have 5 bags available)
```

**After**:
```jsx
Number of Bags * (You have 3 bags available)
```

### **3. Dropdown Options**

**Before**: Shows options 1-5 (based on total bags)

**After**: Shows options 1-3 (based on available bags)

### **4. Disabled State**

Form is disabled when `availableBags <= 0` instead of `totalBags <= 0`

---

## 📊 **Example Scenarios**

### **Scenario 1: Initial State**
- User scans a batch with 5 bags
- `total_bags` in `user_stats` = 5
- Dashboard "Batches & Bags" card shows: **5 bags**
- No pending pickups
- `availableBags` = 5 - 0 = **5 bags available**

### **Scenario 2: One Pending Pickup**
- User requests pickup for 3 bags (status: pending)
- Dashboard "Batches & Bags" card **still shows: 5 bags** 
- `requestedBags` = 3
- `availableBags` = 5 - 3 = **2 bags available**
- Request Pickup page shows: "You have **2** bag(s) available"

### **Scenario 3: Multiple Pending Pickups**
- User has 2 pending pickups: 2 bags + 1 bag
- Dashboard "Batches & Bags" card **still shows: 5 bags** 
- `requestedBags` = 3
- `availableBags` = 5 - 3 = **2 bags available**

### **Scenario 4: Pickup Completed**
- One pickup (3 bags) is marked as completed
- Dashboard "Batches & Bags" card **still shows: 5 bags** 
- Completed pickups don't count toward `requestedBags`
- `requestedBags` = 0 (no more pending pickups)
- `availableBags` = 5 - 0 = **5 bags available**

### **Scenario 5: Pickup Cancelled**
- User cancels a pending pickup (3 bags)
- Dashboard "Batches & Bags" card **still shows: 5 bags** 
- `requestedBags` = 0 (cancelled pickups don't count)
- `availableBags` = 5 - 0 = **5 bags available**

### **Scenario 6: Edge Case - More Requested Than Total**
- User somehow has 6 bags requested but only 5 total
- Dashboard "Batches & Bags" card **still shows: 5 bags** 
- `availableBags` = Math.max(0, 5 - 6) = **0 bags available**
- System prevents going negative

### **When a pickup is created**:
1. New pickup added to `pickup_requests` table
2. Real-time subscription fires
3. `fetchRequestedBags()` runs
4. `requestedBags` updates
5. `availableBags` recalculates
6. UI updates immediately

### **When a pickup is completed**:
1. Pickup status changes from 'pending' to 'completed'
2. Real-time subscription fires
3. `fetchRequestedBags()` runs (completed pickups not counted)
4. `requestedBags` decreases
5. `availableBags` increases
6. UI shows more bags available

### **When a pickup is cancelled**:
1. Pickup status changes to 'cancelled' or deleted
2. Real-time subscription fires
3. `fetchRequestedBags()` runs
4. `requestedBags` decreases
5. Bags return to available pool

---

## 📁 **File Modified**

**`/src/pages/PickupRequest.js`**

### **Changes Made**:

1. **Added state** for `requestedBags`
2. **Added calculation** for `availableBags`
3. **Added useEffect** to fetch requested bags from database
4. **Added real-time subscription** for pickup_requests table
5. **Updated validation** to use availableBags
6. **Updated UI messages** to show breakdown
7. **Updated form controls** to use availableBags
8. **Added useEffect** to sync insufficientBags state

---

## 🧪 **Testing Checklist**

- [ ] **No pending pickups** - Shows full bag count
- [ ] **With pending pickups** - Shows reduced count
- [ ] **All bags requested** - Form disabled
- [ ] **Try to over-request** - Validation error shown
- [ ] **Create new pickup** - Available bags decrease immediately
- [ ] **Complete pickup** - Available bags increase
- [ ] **Cancel pickup** - Bags return to available
- [ ] **Breakdown message** - Shows when bags are requested
- [ ] **Dropdown options** - Limited to available bags
- [ ] **Form disabled state** - Correct based on available bags
- [ ] **Error messages** - Clear explanation of total vs available

---

## 💡 **Key Features**

1. **Zero Can't Go Negative** ✅
   ```javascript
   Math.max(0, totalBags - requestedBags)
   ```

2. **Real-time Updates** ✅
   - Subscription to pickup_requests table
   - Immediate UI refresh on changes

3. **Clear Communication** ✅
   - Shows total vs requested vs available
   - User understands why they have fewer bags

4. **Validation at Multiple Levels** ✅
   - Form validation (Yup schema)
   - Submit validation (before API call)
   - UI disabled state

5. **Active Pickups Only** ✅
   - Counts bags in 'available', 'pending', 'scheduled', 'accepted', and 'in_transit' pickups
   - Completed pickups don't count (bags are gone)
   - Cancelled pickups don't count (bags return to available pool)
   - Disposed pickups don't count (bags are gone)

---

## 📊 **Database Query**

```sql
-- Get requested bags for a user
SELECT SUM(bag_count) as requested_bags
FROM pickup_requests
WHERE user_id = $1
  AND status IN ('available', 'pending', 'scheduled', 'accepted', 'in_transit');

-- Get total bags for a user
SELECT total_bags
FROM user_stats
WHERE user_id = $1;

-- Calculate available
-- available_bags = total_bags - requested_bags (minimum 0)
```

---

## 🚀 **Performance**

- **Single query** per data fetch
- **Real-time updates** via Supabase subscriptions
- **Refs for validation** to avoid Formik remounts
- **Efficient calculation** using simple subtraction
- **No polling** - event-driven updates only

---

## 🔐 **Security**

- **User-specific queries** - Only fetches user's own data
- **Row-level security** - Supabase RLS enforced
- **Validation** - Server-side validation should also check
- **Cannot go negative** - Math.max(0, ...) protection

---

## 🔄 **Future Enhancements**

1. **Add status filter UI**
   - Let users see which pickups have their bags

2. **Add pickup history tooltip**
   - Hover to see breakdown of requested bags

3. **Add reservation timeout**
   - Auto-cancel pending pickups after 24 hours

4. **Add bag priority system**
   - FIFO or priority-based bag allocation

5. **Add bulk cancel**
   - Release all pending pickups at once

---

## ✅ **Completion Status**

**Status**: ✅ **COMPLETE**

All requirements met:
- ✅ Available bags = total - requested
- ✅ Never goes below 0
- ✅ Updates in real-time
- ✅ Clear UI messaging
- ✅ Form validation updated
- ✅ Dropdown options limited
- ✅ Breakdown shown when applicable
- ✅ Counts all active pickup statuses (available, pending, scheduled, accepted, in_transit)

---

**Last Updated**: 2025-01-21 00:03 UTC  
**Restored**: Dynamic calculation with active pickup tracking  
**Verified By**: Cascade AI Assistant  
**Ready for**: ✅ **Testing & Deployment**
