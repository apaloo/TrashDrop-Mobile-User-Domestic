# Digital Bin Enhancement: Bin Sizes & Urgent Priority

## Overview
Add bin size selection (mandatory) and urgent priority flag to the Digital Bin feature to enable cost calculation and request prioritization.

---

## Requirements

### 1. Bin Sizes (Mandatory)
- **Available Sizes (Liters)**: 60, 80, 90, 100, 120, 240, 340, 360, 660, 1100
- **Purpose**: Determines collection cost
- **UI**: Dropdown selector in Step 3 (Waste Details)
- **Validation**: Required field - cannot proceed without selection

### 2. Urgent Priority (Optional)
- **UI**: Checkbox/Toggle in Step 3 (Waste Details)
- **Purpose**: Flag requests for priority handling
- **Default**: false (not urgent)
- **Display**: Badge/indicator on QR cards when urgent

### 3. Cost Calculation
- **Base Logic**: Cost = f(bin_size, waste_type, frequency, urgency)
- **Display**: Show estimated cost in Review Step
- **Future**: API integration for dynamic pricing

---

## Implementation Plan

### Phase 1: Database Schema Updates ✅

#### New Migration: `20250120000000_add_bin_size_and_urgent.sql`

```sql
-- Add bin_size_liters column to digital_bins table
ALTER TABLE public.digital_bins 
ADD COLUMN IF NOT EXISTS bin_size_liters INTEGER NOT NULL DEFAULT 120;

-- Add is_urgent column to digital_bins table
ALTER TABLE public.digital_bins 
ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;

-- Add constraint to validate bin sizes
ALTER TABLE public.digital_bins 
ADD CONSTRAINT check_bin_size 
CHECK (bin_size_liters IN (60, 80, 90, 100, 120, 240, 340, 360, 660, 1100));

-- Create index for bin size queries (for reporting/analytics)
CREATE INDEX IF NOT EXISTS idx_digital_bins_bin_size 
ON public.digital_bins(bin_size_liters);

-- Create index for urgent bins (for priority processing)
CREATE INDEX IF NOT EXISTS idx_digital_bins_urgent 
ON public.digital_bins(is_urgent) 
WHERE is_urgent = true;

-- Add comment for documentation
COMMENT ON COLUMN public.digital_bins.bin_size_liters IS 
'Size of the bin in liters. Valid sizes: 60, 80, 90, 100, 120, 240, 340, 360, 660, 1100';

COMMENT ON COLUMN public.digital_bins.is_urgent IS 
'Flag to indicate if this bin request should be prioritized for collection';
```

**Rollback Plan:**
```sql
-- Remove indexes
DROP INDEX IF EXISTS idx_digital_bins_urgent;
DROP INDEX IF EXISTS idx_digital_bins_bin_size;

-- Remove constraint
ALTER TABLE public.digital_bins DROP CONSTRAINT IF EXISTS check_bin_size;

-- Remove columns (CAUTION: Data loss)
ALTER TABLE public.digital_bins DROP COLUMN IF EXISTS is_urgent;
ALTER TABLE public.digital_bins DROP COLUMN IF EXISTS bin_size_liters;
```

---

### Phase 2: Frontend State Management

#### File: `src/pages/DigitalBin.js`

**Changes to formData state:**
```javascript
const [formData, setFormData] = useState({
  // Location details
  location_id: null,
  location_name: 'Home',
  address: '',
  latitude: null,
  longitude: null,
  is_default: true,
  
  // Schedule details
  frequency: 'weekly',
  startDate: '',
  preferredTime: 'morning',
  
  // Waste details
  bag_count: 1,
  waste_type: 'general',
  bin_size_liters: 120,        // NEW: Default to 120L
  is_urgent: false,             // NEW: Default not urgent
  
  // Additional info
  notes: '',
  photos: [],
  
  // Internal state
  savedLocations: [],
  isNewLocation: true
});
```

**Update form submission (around line 767-836):**
```javascript
// Add bin_size_liters and is_urgent to the insert
const { data: bin, error: binError } = await supabase
  .from('digital_bins')
  .insert({
    user_id: user.id,
    location_id: locationId,
    qr_code_url: qrCodeUrl,
    frequency: formData.frequency,
    waste_type: formData.waste_type,
    bag_count: formData.bag_count,
    bin_size_liters: formData.bin_size_liters,  // NEW
    is_urgent: formData.is_urgent,               // NEW
    special_instructions: formData.notes,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true
  })
  .select()
  .single();
```

---

### Phase 3: Component Updates

#### File: `src/components/digitalBin/WasteDetailsStep.js`

**Current Structure:**
- Number of Bins (dropdown: 1-5)
- Bin Type (radio: general/recycling/organic)

**Updated Structure:**
```javascript
import React from 'react';

const WasteDetailsStep = ({ formData, updateFormData, nextStep, prevStep }) => {
  // Bin size options (in liters)
  const BIN_SIZES = [60, 80, 90, 100, 120, 240, 340, 360, 660, 1100];
  
  // Validation: All required fields must be filled
  const isValid = () => {
    return formData.numberOfBags && 
           formData.wasteType && 
           formData.bin_size_liters;  // NEW: Required
  };
  
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Digital Bin Details</h2>
      
      {/* Number of Bins - EXISTING */}
      <div className="mb-5">
        {/* ... existing code ... */}
      </div>
      
      {/* Bin Size - NEW (MANDATORY) */}
      <div className="mb-5">
        <label htmlFor="binSize" className="block text-sm font-medium text-gray-900 mb-1">
          Bin Size (Liters) <span className="text-red-500">*</span>
        </label>
        <select
          id="binSize"
          value={formData.bin_size_liters}
          onChange={(e) => updateFormData({ bin_size_liters: parseInt(e.target.value) })}
          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 font-medium"
          style={{color: '#333'}}
          required
        >
          {BIN_SIZES.map(size => (
            <option key={size} value={size}>
              {size}L {size === 120 && '(Recommended)'}
            </option>
          ))}
        </select>
        <p className="text-sm text-gray-500 mt-1">
          Larger bins cost more but accommodate more waste. Collection cost is calculated based on bin size.
        </p>
      </div>
      
      {/* Waste Type - EXISTING */}
      <div className="mb-5">
        {/* ... existing code ... */}
      </div>
      
      {/* Urgent Priority - NEW (OPTIONAL) */}
      <div className="mb-5 bg-yellow-50 p-4 rounded-md border border-yellow-200">
        <div className="flex items-start">
          <input
            id="isUrgent"
            type="checkbox"
            checked={formData.is_urgent}
            onChange={(e) => updateFormData({ is_urgent: e.target.checked })}
            className="h-5 w-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5"
          />
          <div className="ml-3 flex-1">
            <label htmlFor="isUrgent" className="block text-sm font-medium text-gray-900">
              Mark as Urgent
            </label>
            <p className="text-sm text-gray-600 mt-1">
              Check this box to prioritize your request. Urgent pickups are processed first and may incur an additional fee.
            </p>
          </div>
        </div>
      </div>
      
      {/* Navigation Buttons */}
      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={prevStep}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={nextStep}
          disabled={!isValid()}
          className={`px-6 py-2 rounded-md transition-colors ${
            isValid()
              ? 'bg-primary hover:bg-primary-dark text-white'
              : 'bg-gray-300 cursor-not-allowed text-gray-500'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default WasteDetailsStep;
```

---

#### File: `src/components/digitalBin/ReviewStep.js`

**Add Bin Size & Urgent Status Display:**

```javascript
// After waste details section (around line 91-103)
<div className="bg-gray-50 p-4 rounded-md mb-6">
  <h3 className="text-lg font-semibold mb-3 text-gray-900">Waste Details</h3>
  <div className="grid grid-cols-2 gap-2">
    <div>
      <span className="text-sm text-gray-700 font-medium">Number of Bins:</span>
      <p className="text-gray-900 font-medium">{formData.numberOfBags} Bin{formData.numberOfBags > 1 ? 's' : ''}</p>
    </div>
    <div>
      <span className="text-sm text-gray-700 font-medium">Bin Size:</span>
      <p className="text-gray-900 font-medium">{formData.bin_size_liters}L</p>
    </div>
    <div>
      <span className="text-sm text-gray-700 font-medium">Waste Type:</span>
      <p className="text-gray-900 font-medium">{formatWasteType(formData.wasteType)}</p>
    </div>
    {formData.is_urgent && (
      <div className="col-span-2">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
          ⚡ Urgent Priority
        </span>
      </div>
    )}
  </div>
</div>

{/* NEW: Cost Estimate Section */}
<div className="bg-blue-50 p-4 rounded-md mb-6 border border-blue-200">
  <h3 className="text-lg font-semibold mb-3 text-gray-900">Estimated Cost</h3>
  <div className="text-2xl font-bold text-primary mb-2">
    GH₵ {calculateEstimatedCost(formData)}
  </div>
  <p className="text-sm text-gray-700 font-medium">
    Based on: {formData.bin_size_liters}L bin, {formatFrequency(formData.frequency)} service
    {formData.is_urgent && ', Urgent processing (+10%)'}
  </p>
  <p className="text-xs text-gray-600 mt-2">
    * Final cost may vary based on actual waste volume and additional services
  </p>
</div>
```

**Add Cost Calculation Helper:**
```javascript
// At the top of ReviewStep component
const calculateEstimatedCost = (formData) => {
  // Base cost mapping by bin size
  const BASE_COSTS = {
    60: 15,
    80: 20,
    90: 25,
    100: 30,
    120: 35,
    240: 60,
    340: 85,
    360: 90,
    660: 150,
    1100: 250
  };
  
  let cost = BASE_COSTS[formData.bin_size_liters] || 35;
  
  // Frequency multiplier
  const frequencyMultiplier = {
    'weekly': 1.0,
    'biweekly': 0.9,  // 10% discount
    'monthly': 0.8    // 20% discount
  };
  cost *= frequencyMultiplier[formData.frequency] || 1.0;
  
  // Waste type adjustment
  const wasteTypeMultiplier = {
    'general': 1.0,
    'recycling': 0.9,  // 10% cheaper
    'organic': 1.1     // 10% more expensive
  };
  cost *= wasteTypeMultiplier[formData.wasteType || formData.waste_type] || 1.0;
  
  // Urgent priority surcharge
  if (formData.is_urgent) {
    cost *= 1.1;  // 10% surcharge for urgent
  }
  
  // Multiple bins
  cost *= formData.numberOfBags || formData.bag_count || 1;
  
  return cost.toFixed(2);
};
```

---

#### File: `src/components/digitalBin/ScheduledQRTab.js`

**Update to display bin size and urgent status:**

Around line 365+ (QR card display), add:
```javascript
{/* Bin Size Badge */}
<div className="flex items-center text-sm text-gray-600 font-medium">
  <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-semibold">
    {pickup.bin_size_liters || 120}L
  </span>
</div>

{/* Urgent Badge */}
{pickup.is_urgent && (
  <div className="flex items-center text-sm">
    <span className="inline-flex items-center px-2 py-1 rounded-md bg-yellow-100 text-yellow-800 text-xs font-semibold">
      ⚡ Urgent
    </span>
  </div>
)}
```

---

### Phase 4: Utility Functions

#### File: `src/utils/costCalculator.js` (NEW)

```javascript
/**
 * Calculate estimated cost for digital bin service
 * @param {Object} params - Bin parameters
 * @param {number} params.bin_size_liters - Size of bin in liters
 * @param {string} params.frequency - Service frequency (weekly/biweekly/monthly)
 * @param {string} params.waste_type - Type of waste (general/recycling/organic)
 * @param {boolean} params.is_urgent - Whether request is urgent
 * @param {number} params.bag_count - Number of bins
 * @returns {number} Estimated cost in GHS
 */
export const calculateBinCost = ({
  bin_size_liters,
  frequency = 'weekly',
  waste_type = 'general',
  is_urgent = false,
  bag_count = 1
}) => {
  // Base cost by bin size (in GHS)
  const BASE_COSTS = {
    60: 15,
    80: 20,
    90: 25,
    100: 30,
    120: 35,
    240: 60,
    340: 85,
    360: 90,
    660: 150,
    1100: 250
  };
  
  let cost = BASE_COSTS[bin_size_liters] || 35;
  
  // Frequency discount
  const FREQUENCY_MULTIPLIERS = {
    weekly: 1.0,
    biweekly: 0.9,   // 10% discount for less frequent service
    monthly: 0.8     // 20% discount for monthly service
  };
  cost *= FREQUENCY_MULTIPLIERS[frequency] || 1.0;
  
  // Waste type adjustment
  const WASTE_TYPE_MULTIPLIERS = {
    general: 1.0,
    recycling: 0.9,   // Recycling is slightly cheaper
    organic: 1.1      // Organic waste requires special handling
  };
  cost *= WASTE_TYPE_MULTIPLIERS[waste_type] || 1.0;
  
  // Urgent priority surcharge
  if (is_urgent) {
    cost *= 1.1;  // 10% surcharge for priority handling
  }
  
  // Multiple bins
  cost *= bag_count;
  
  return parseFloat(cost.toFixed(2));
};

/**
 * Get user-friendly bin size label
 */
export const getBinSizeLabel = (liters) => {
  const labels = {
    60: 'Extra Small',
    80: 'Small',
    90: 'Small',
    100: 'Medium',
    120: 'Medium (Standard)',
    240: 'Large',
    340: 'Extra Large',
    360: 'Extra Large',
    660: 'Industrial',
    1100: 'Commercial'
  };
  
  return `${liters}L - ${labels[liters] || 'Standard'}`;
};

/**
 * Available bin sizes
 */
export const BIN_SIZES = [60, 80, 90, 100, 120, 240, 340, 360, 660, 1100];

export default {
  calculateBinCost,
  getBinSizeLabel,
  BIN_SIZES
};
```

---

### Phase 5: Backward Compatibility

**Handling Existing Records Without bin_size_liters:**

1. **Database Default**: Set DEFAULT 120 in migration
2. **Frontend Fallback**: Always show `|| 120` when displaying
3. **Query Handling**: No special handling needed (default takes care of it)

```javascript
// Example in ScheduledQRTab.js
const binSize = pickup.bin_size_liters || 120;  // Fallback to 120L
```

---

## Testing Checklist

### Unit Tests
- [ ] Cost calculation with various bin sizes
- [ ] Urgent flag toggle in form
- [ ] Validation of bin size selection
- [ ] Form data persistence across steps

### Integration Tests
- [ ] Create digital bin with bin size
- [ ] Create urgent digital bin
- [ ] Display bin size on QR cards
- [ ] Cost calculation accuracy
- [ ] Database constraints enforcement

### E2E Tests
- [ ] Complete flow: Select 240L bin → Check urgent → Submit → View QR
- [ ] Edit existing bin (ensure defaults work)
- [ ] Multiple bins with different sizes
- [ ] Filter/sort by bin size (future)
- [ ] Urgent bins display correctly on dashboard

### Edge Cases
- [ ] Missing bin_size_liters in old records
- [ ] Invalid bin size values
- [ ] Cost calculation edge cases (0 bins, negative values)
- [ ] Urgent toggle persistence

---

## Migration Strategy

### Step 1: Database Migration (Safe)
```bash
# Run migration on Supabase
# This adds columns with defaults, won't break existing data
```

### Step 2: Deploy Backend Changes (if any)
- Cost calculation API endpoint (future)
- Priority queue for urgent bins (future)

### Step 3: Deploy Frontend Changes
- Update all components in one release
- Ensure fallback values work for old records

### Step 4: Verify
- Test with existing digital bins (should show 120L default)
- Test creating new bins with size selection
- Test urgent flag functionality

---

## Cost Pricing Model (Initial)

| Bin Size | Base Cost | Weekly | Bi-weekly | Monthly |
|----------|-----------|---------|-----------|---------|
| 60L      | GH₵ 15    | 15.00   | 13.50     | 12.00   |
| 80L      | GH₵ 20    | 20.00   | 18.00     | 16.00   |
| 90L      | GH₵ 25    | 25.00   | 22.50     | 20.00   |
| 100L     | GH₵ 30    | 30.00   | 27.00     | 24.00   |
| 120L     | GH₵ 35    | 35.00   | 31.50     | 28.00   |
| 240L     | GH₵ 60    | 60.00   | 54.00     | 48.00   |
| 340L     | GH₵ 85    | 85.00   | 76.50     | 68.00   |
| 360L     | GH₵ 90    | 90.00   | 81.00     | 72.00   |
| 660L     | GH₵ 150   | 150.00  | 135.00    | 120.00  |
| 1100L    | GH₵ 250   | 250.00  | 225.00    | 200.00  |

**Modifiers:**
- Recycling: -10%
- Organic: +10%
- Urgent: +10% surcharge
- Multiple bins: Linear multiplication

---

## UI/UX Considerations

### Visual Indicators
1. **Bin Size Dropdown**: Clear labels with "Recommended" tag on 120L
2. **Urgent Checkbox**: Yellow/amber styling to indicate priority
3. **Cost Display**: Large, prominent in Review Step
4. **QR Cards**: Compact badges for size and urgent status

### User Education
- Tooltip on bin size: "Larger bins cost more but need less frequent emptying"
- Info box on urgent: "Urgent requests are processed first, +10% fee applies"
- Cost breakdown: Show formula components clearly

### Mobile Responsiveness
- Dropdown works well on mobile
- Checkbox has large touch target
- Cost display adapts to screen size

---

## Future Enhancements

1. **Dynamic Pricing API**: Replace hardcoded costs with API calls
2. **Bin Size Recommendations**: AI-based suggestions based on user history
3. **Urgent SLA**: Guaranteed pickup time for urgent requests
4. **Bin Size Analytics**: Dashboard showing most popular sizes
5. **Volume Tracking**: Track actual usage vs bin size
6. **Smart Upgrades**: Suggest size upgrades based on overflow patterns

---

## Success Criteria

✅ All 10 bin sizes selectable  
✅ Bin size is mandatory (cannot submit without)  
✅ Urgent checkbox works and persists  
✅ Cost calculation accurate and displayed  
✅ Database migration successful with no data loss  
✅ Existing digital bins show default 120L  
✅ QR cards display bin size and urgent status  
✅ No breaking changes to existing flow  
✅ All tests pass  
✅ Documentation complete  

---

## Timeline Estimate

- **Phase 1 (Database)**: 30 minutes
- **Phase 2 (State Management)**: 30 minutes
- **Phase 3 (Components)**: 2 hours
- **Phase 4 (Utilities)**: 1 hour
- **Phase 5 (Testing)**: 1.5 hours
- **Total**: ~5.5 hours

---

## Notes

- Use `bin_size_liters` consistently (not `binSize` or `bin_size`)
- Default to 120L as it's the most common household size
- Urgent flag is optional but should be prominently displayed when set
- Cost calculation should be client-side for speed, server-validated later
- Keep existing `bag_count` separate from `bin_size_liters` (they serve different purposes)

