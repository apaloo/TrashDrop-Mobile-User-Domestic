# Digital Bin Fee Calculation Fix

## Problem Identified

The cost breakdown was being **calculated and displayed** to users (GH₵ 31.00), but **not saved** to the database, resulting in all fee fields showing `0.00` in Supabase.

### Root Cause

In `DigitalBin.js`, the digital bin insert statements were missing all fee-related fields:

```javascript
// BEFORE: Missing fee fields ❌
.insert({
  user_id: user.id,
  location_id: locationId,
  qr_code_url: qrCodeUrl,
  frequency: formData.frequency,
  waste_type: formData.waste_type,
  bag_count: formData.bag_count,
  bin_size_liters: formData.bin_size_liters,
  is_urgent: formData.is_urgent,
  expires_at: expiryDate.toISOString(),
  is_active: true
  // ❌ NO FEE FIELDS!
})
```

## Solution Implemented

### 1. Created Digital Bin Service (`/src/services/digitalBinService.js`)

New service module with `prepareDigitalBinData()` function that:
- Calculates cost breakdown using `getCostBreakdown()` from `costCalculator.js`
- Includes all fee fields per SOP v4.5.6
- Returns complete digital bin data ready for database insert

**Fields now calculated and saved:**
- `fee`: Total amount user pays (GH₵ 31.00)
- `collector_core_payout`: Base collection fee (GH₵ 30.00)
- `collector_urgent_payout`: Urgent surcharge if applicable (30% of base)
- `collector_distance_payout`: Distance-based charge if urgent + >5km
- `collector_surge_payout`: Server-calculated surge (placeholder `0.00`)
- `collector_tips`: Tips field (placeholder `0.00`)
- `collector_recyclables_payout`: Post-collection recyclables split (placeholder `0.00`)
- `collector_loyalty_cashback`: Loyalty rewards (placeholder `0.00`)
- `collector_total_payout`: Sum of collector payouts
- `surge_multiplier`: Surge factor (default `1.00`)
- `deadhead_km`: Collector deadhead distance (placeholder `0.00`)

### 2. Updated Digital Bin Creation

Modified two insert locations in `DigitalBin.js`:

1. **Main handleSubmit function** (lines 772-791)
2. **createDigitalBin helper function** (lines 816-833)

Both now use `prepareDigitalBinData()` to include calculated fees.

```javascript
// AFTER: With complete fee calculation ✅
const digitalBinData = prepareDigitalBinData({
  user_id: user.id,
  location_id: locationId,
  qr_code_url: qrCodeUrl,
  frequency: formData.frequency,
  waste_type: formData.waste_type,
  bag_count: formData.bag_count,
  bin_size_liters: formData.bin_size_liters,
  is_urgent: formData.is_urgent || false,
  expires_at: expiryDate.toISOString()
});

const { data: bin, error: binError } = await supabase
  .from('digital_bins')
  .insert(digitalBinData) // ✅ Includes all fee fields
  .select()
  .single();
```

## Cost Breakdown Example

For your specific request (120L bin, weekly, general waste, not urgent):

| Item | Amount |
|------|--------|
| Base (120L × 1) | GH₵ 30.00 |
| Request fee | GH₵ 1.00 |
| **TOTAL** | **GH₵ 31.00** |

This matches what's shown in the UI and will now be saved to the database.

## Files Changed

1. **Created:** `/src/services/digitalBinService.js` (new file, +76 lines)
2. **Modified:** `/src/pages/DigitalBin.js`
   - Added import for `prepareDigitalBinData`
   - Updated main digital bin insert (handleSubmit)
   - Updated helper function digital bin insert (createDigitalBin)
   - Fixed corrupted code sections

## Verification

✅ **Build Status:** Compiled successfully
✅ **Bundle Size:** +4.14 kB (expected for new service file)
✅ **Fee Calculation:** SOP v4.5.6 compliant
✅ **Database Schema:** All fields aligned with Supabase schema

## Next Steps for Testing

1. Create a new digital bin through the app
2. Check the database record in Supabase
3. Verify all fee fields are populated with correct values:
   - `fee` should show `31.00` (for 120L standard bin)
   - `collector_core_payout` should show `30.00`
   - `collector_urgent_payout` should show `0.00` (not urgent)
   - `collector_total_payout` should show `30.00`

## SOP v4.5.6 Compliance

The fee calculation follows the official pricing order:
1. **Base** (bin size × quantity)
2. **On-site charges** (if any)
3. **Discounts** (capped at 80% of core)
4. **Urgent surcharge** (30% of base, only if urgent)
5. **Distance charge** (only if urgent + >5km, capped at 10km)
6. **Request fee** (GH₵ 1.00)
7. **Surge** (server-calculated when accepted)

All placeholder fields (`surge_payout`, `tips`, `recyclables_payout`, etc.) are set to `0.00` and will be calculated server-side or post-collection as appropriate.
