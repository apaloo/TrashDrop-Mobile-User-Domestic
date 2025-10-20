# Digital Bin API Integration (SOP v4.5.6)

## Overview

This document specifies the server-side API requirements for Digital Bin pricing and quote generation, compliant with TrashDrop SOP v4.5.6.

**Key Principle**: Client-side cost calculator provides **estimates only**. Server provides **binding quotes** with real-time surge detection and actual collector distances.

---

## API Endpoints

### 1. POST `/api/digital-bins/quote`

**Purpose**: Generate accurate pricing quote for digital bin request

**When to Call**:
- User clicks "Next" to Review step (initial quote)
- User toggles Urgent ON/OFF (real-time re-quote)
- Quote expires (>60 seconds old) and user confirms

**Request Body**:
```json
{
  "bin_size_liters": 120,
  "bag_count": 1,
  "location": {
    "latitude": 5.614736,
    "longitude": -0.208811
  },
  "is_urgent": false,
  "waste_type": "general",
  "frequency": "weekly"
}
```

**Response** (200 OK):
```json
{
  "quote_id": "qt_abc123xyz",
  "expires_at": "2025-10-20T18:05:00Z",
  "pricing": {
    "base": 30.00,
    "urgent_charge": 0,
    "distance_charge": 0,
    "peak_adjustment": 0,
    "on_site_charges": 0,
    "discount_applied": 0,
    "request_fee": 1.00,
    "taxes": 0,
    "subtotal": 30.00,
    "total": 31.00
  },
  "breakdown_visible": {
    "urgent_charge": false,
    "distance_charge": false,
    "peak_adjustment": false,
    "on_site_charges": false,
    "discount": false
  },
  "metadata": {
    "nearest_collector_km": 3.2,
    "surge_multiplier": 1.0,
    "surge_active": false,
    "anchor_distance_t0": 3.2
  }
}
```

**Response** (with Urgent & Surge):
```json
{
  "quote_id": "qt_def456uvw",
  "expires_at": "2025-10-20T18:06:00Z",
  "pricing": {
    "base": 30.00,
    "urgent_charge": 9.00,        // 30% of base
    "distance_charge": 0,          // < 5km threshold
    "peak_adjustment": 7.80,       // (30+9) × 0.2 = surge uplift
    "on_site_charges": 0,
    "discount_applied": 0,
    "request_fee": 1.00,
    "taxes": 0,
    "subtotal": 46.80,
    "total": 47.80
  },
  "breakdown_visible": {
    "urgent_charge": true,         // Show on receipt
    "distance_charge": false,      // Hide (0)
    "peak_adjustment": true,       // Show as "Peak time adjustment"
    "on_site_charges": false,
    "discount": false
  },
  "metadata": {
    "nearest_collector_km": 3.2,
    "surge_multiplier": 1.2,       // DON'T show multiplier to user
    "surge_active": true,
    "surge_reason": "Peak collection hours",
    "anchor_distance_t0": 3.2
  }
}
```

**Response** (with Distance Billing):
```json
{
  "quote_id": "qt_ghi789rst",
  "expires_at": "2025-10-20T18:07:00Z",
  "pricing": {
    "base": 30.00,
    "urgent_charge": 9.00,
    "distance_charge": 4.50,       // 2.5 km × (0.06 × 30) = 2.5 × 1.80
    "peak_adjustment": 0,
    "on_site_charges": 0,
    "discount_applied": 0,
    "request_fee": 1.00,
    "taxes": 0,
    "subtotal": 43.50,
    "total": 44.50
  },
  "breakdown_visible": {
    "urgent_charge": true,
    "distance_charge": true,       // Show with billable km
    "peak_adjustment": false,
    "on_site_charges": false,
    "discount": false
  },
  "metadata": {
    "nearest_collector_km": 7.5,   // > 5km threshold
    "billable_km": 2.5,             // min(7.5, 10) - 5 = 2.5
    "per_km_rate": 1.80,            // 0.06 × 30 base
    "surge_multiplier": 1.0,
    "surge_active": false,
    "anchor_distance_t0": 7.5
  }
}
```

---

## Pricing Calculation Logic (Server-Side)

### Step-by-Step Algorithm

```javascript
// SOP v4.5.6 Pricing Order:
// Base → On-site → Discounts (max 80%) → Urgent (30% of Base) → 
// Distance (>5-10km, Urgent only) → Surge (on eligible subtotal) → Request fee → Taxes

function calculateQuote(request) {
  // 1. Base cost (from pricing table)
  const baseCost = BASE_COSTS[request.bin_size_liters] || BASE_COSTS[120];
  const base = baseCost * request.bag_count;
  
  // 2. On-site charges (if applicable)
  const onSiteCharges = 0; // Future: gate access, contamination, etc.
  
  // 3. Discounts (capped at 80% of Core)
  const coreBeforeDiscount = base + onSiteCharges;
  const maxDiscount = coreBeforeDiscount * 0.80;
  const discountApplied = Math.min(request.discount_amount || 0, maxDiscount);
  const core = Math.max(0, coreBeforeDiscount - discountApplied);
  
  // 4. Urgent surcharge (30% of Base, not Core)
  const urgentCharge = request.is_urgent ? (base * 0.30) : 0;
  
  // 5. Distance charge (Urgent only, >5-10km)
  let distanceCharge = 0;
  let billableKm = 0;
  if (request.is_urgent) {
    const nearestCollectorKm = findNearestCollector(request.location); // GPS query
    const anchorDistanceT0 = nearestCollectorKm;
    
    if (nearestCollectorKm > 5) {
      billableKm = Math.max(0, Math.min(nearestCollectorKm, 10) - 5);
      const perKmRate = 0.06 * base; // 0.06 × Base per km
      distanceCharge = billableKm * perKmRate;
    }
  }
  
  // 6. Surge multiplier (peak times)
  const surgeMultiplier = detectSurge(); // Real-time surge detection
  const surgeEligibleSubtotal = core + urgentCharge + distanceCharge;
  const peakAdjustment = (surgeMultiplier - 1) * surgeEligibleSubtotal;
  const subtotal = surgeEligibleSubtotal * surgeMultiplier;
  
  // 7. Request fee (not affected by surge)
  const requestFee = 1.0;
  
  // 8. Taxes
  const taxRate = 0; // 0% for now
  const taxes = (subtotal + requestFee) * taxRate;
  
  // 9. Total
  const total = subtotal + requestFee + taxes;
  
  return {
    quote_id: generateQuoteId(),
    expires_at: new Date(Date.now() + 60000).toISOString(), // 60s validity
    pricing: {
      base: round2(base),
      urgent_charge: round2(urgentCharge),
      distance_charge: round2(distanceCharge),
      peak_adjustment: round2(peakAdjustment),
      on_site_charges: round2(onSiteCharges),
      discount_applied: round2(discountApplied),
      request_fee: requestFee,
      taxes: round2(taxes),
      subtotal: round2(subtotal),
      total: round2(total)
    },
    breakdown_visible: {
      urgent_charge: urgentCharge > 0,
      distance_charge: distanceCharge > 0,
      peak_adjustment: peakAdjustment > 0,
      on_site_charges: onSiteCharges > 0,
      discount: discountApplied > 0
    },
    metadata: {
      nearest_collector_km: round2(nearestCollectorKm),
      billable_km: round2(billableKm),
      per_km_rate: round2(0.06 * base),
      surge_multiplier: surgeMultiplier,
      surge_active: surgeMultiplier > 1.0,
      surge_reason: surgeMultiplier > 1.0 ? getSurgeReason() : null,
      anchor_distance_t0: round2(anchorDistanceT0)
    }
  };
}
```

---

## Distance Anchoring (SOP v4.5.6)

### T₀ (Quote Time)
- Find nearest eligible collector within 60s GPS query
- Lock `anchor_distance_t0` = nearest distance
- Calculate billable km: `max(0, min(anchor_distance_t0, 10) - 5)`
- **Never increase** after T₀

### T₁ (Accept Time)
- When user confirms, find accepting collector distance
- Apply **only-down** rule: `min(anchor_distance_t0, actual_accept_distance)`
- Update billable km if lower

### T₂ (Completion - Optional)
- After pickup, can decrease further if nearer collector was available
- **Never increase** from T₀ or T₁

---

## Surge Detection Logic

### When to Apply Surge
```javascript
function detectSurge() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  
  // Peak collection hours (Mon-Fri, 6-9am, 5-7pm)
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    if ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 19)) {
      return 1.2; // ×1.2 multiplier
    }
  }
  
  // Weekend mornings (Sat-Sun, 8-11am)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (hour >= 8 && hour < 11) {
      return 1.3; // ×1.3 multiplier
    }
  }
  
  // Holiday events (fetch from database)
  if (isHolidayOrEvent(now)) {
    return 1.5; // ×1.5 multiplier
  }
  
  // No surge
  return 1.0;
}
```

### Surge Display Rules
- **DON'T** show "Surge ×1.2" to user
- **DO** show "Peak time adjustment ₵X.XX" (calculated uplift)
- Reason: User sees the effect, not the internal multiplier

---

## Client-Side Integration

### 1. Review Step - Initial Load

```javascript
// ReviewStep.js
import { useState, useEffect } from 'react';
import { getCostBreakdown } from '../../utils/costCalculator';

const ReviewStep = ({ formData, prevStep, handleSubmit }) => {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Fetch quote on mount
  useEffect(() => {
    fetchQuote();
  }, []);
  
  const fetchQuote = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/digital-bins/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bin_size_liters: formData.bin_size_liters,
          bag_count: formData.numberOfBags,
          location: {
            latitude: formData.latitude,
            longitude: formData.longitude
          },
          is_urgent: formData.is_urgent,
          waste_type: formData.wasteType,
          frequency: formData.frequency
        })
      });
      
      const data = await response.json();
      setQuote(data);
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      // Fallback to client-side estimate
      const fallback = getCostBreakdown({
        bin_size_liters: formData.bin_size_liters,
        bag_count: formData.numberOfBags,
        is_urgent: formData.is_urgent
      });
      setQuote({ pricing: fallback, breakdown_visible: fallback.display });
    } finally {
      setLoading(false);
    }
  };
  
  // Re-fetch when urgent toggle changes
  const handleUrgentToggle = async () => {
    // Update formData.is_urgent
    // Then re-fetch quote
    await fetchQuote();
  };
  
  // ... render with quote.pricing
};
```

### 2. Display Quote on Review

```jsx
{loading ? (
  <div className="text-center py-4">Loading pricing...</div>
) : (
  <div className="bg-blue-50 p-4 rounded-md mb-6 border border-blue-200">
    <h3 className="text-lg font-semibold mb-3">Estimated Cost</h3>
    
    {/* Line items */}
    <div className="bg-white p-3 rounded-md mb-3 space-y-2">
      <div className="flex justify-between">
        <span>Base</span>
        <span>{formatCurrency(quote.pricing.base)}</span>
      </div>
      
      {quote.breakdown_visible.urgent_charge && (
        <div className="flex justify-between">
          <span>Urgent surcharge (30%)</span>
          <span>{formatCurrency(quote.pricing.urgent_charge)}</span>
        </div>
      )}
      
      {quote.breakdown_visible.distance_charge && (
        <div className="flex justify-between">
          <span>Distance ({quote.metadata.billable_km.toFixed(1)} km)</span>
          <span>{formatCurrency(quote.pricing.distance_charge)}</span>
        </div>
      )}
      
      {quote.breakdown_visible.peak_adjustment && (
        <div className="flex justify-between">
          <span>Peak time adjustment</span>
          <span>{formatCurrency(quote.pricing.peak_adjustment)}</span>
        </div>
      )}
      
      <div className="flex justify-between pt-2 border-t">
        <span>Request fee</span>
        <span>{formatCurrency(quote.pricing.request_fee)}</span>
      </div>
    </div>
    
    {/* Total */}
    <div className="flex justify-between pt-3 border-t-2">
      <span className="text-lg font-semibold">TOTAL</span>
      <span className="text-3xl font-bold">{formatCurrency(quote.pricing.total)}</span>
    </div>
    
    <p className="text-xs text-gray-600 mt-3 italic">
      Quote valid for {Math.round((new Date(quote.expires_at) - Date.now()) / 1000)}s
    </p>
  </div>
)}
```

---

## Database Schema Requirements

### Quotes Table
```sql
CREATE TABLE digital_bin_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  
  -- Request details
  bin_size_liters INTEGER NOT NULL,
  bag_count INTEGER NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  is_urgent BOOLEAN NOT NULL,
  waste_type VARCHAR(20),
  frequency VARCHAR(20),
  
  -- Pricing breakdown
  base DECIMAL(10, 2) NOT NULL,
  urgent_charge DECIMAL(10, 2) DEFAULT 0,
  distance_charge DECIMAL(10, 2) DEFAULT 0,
  peak_adjustment DECIMAL(10, 2) DEFAULT 0,
  on_site_charges DECIMAL(10, 2) DEFAULT 0,
  discount_applied DECIMAL(10, 2) DEFAULT 0,
  request_fee DECIMAL(10, 2) NOT NULL,
  taxes DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  
  -- Metadata
  nearest_collector_km DECIMAL(5, 2),
  billable_km DECIMAL(5, 2),
  surge_multiplier DECIMAL(3, 2) DEFAULT 1.0,
  surge_active BOOLEAN DEFAULT false,
  anchor_distance_t0 DECIMAL(5, 2),
  
  -- Lifecycle
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP,
  digital_bin_id UUID REFERENCES digital_bins(id)
);

CREATE INDEX idx_quote_id ON digital_bin_quotes(quote_id);
CREATE INDEX idx_user_id ON digital_bin_quotes(user_id);
CREATE INDEX idx_expires_at ON digital_bin_quotes(expires_at);
```

---

## Testing Scenarios

### Test Case 1: Standard Pickup
```json
{
  "bin_size_liters": 120,
  "bag_count": 1,
  "is_urgent": false,
  "location": { "latitude": 5.614, "longitude": -0.208 }
}

Expected: Base ₵30 + Request ₵1 = Total ₵31
```

### Test Case 2: Urgent Pickup (No Distance)
```json
{
  "bin_size_liters": 120,
  "bag_count": 1,
  "is_urgent": true,
  "location": { "latitude": 5.614, "longitude": -0.208 }
}

Expected: Base ₵30 + Urgent ₵9 + Request ₵1 = Total ₵40
```

### Test Case 3: Urgent + Distance (7.5 km)
```json
{
  "bin_size_liters": 120,
  "bag_count": 1,
  "is_urgent": true,
  "nearest_collector_km": 7.5
}

Expected:
- Base: ₵30
- Urgent: ₵9 (30% of ₵30)
- Distance: ₵4.50 (2.5 km × ₵1.80/km where ₵1.80 = 0.06 × ₵30)
- Request: ₵1
- Total: ₵44.50
```

### Test Case 4: Surge × Distance × Urgent
```json
{
  "bin_size_liters": 120,
  "bag_count": 1,
  "is_urgent": true,
  "nearest_collector_km": 7.5,
  "surge_multiplier": 1.2
}

Expected:
- Base: ₵30
- Urgent: ₵9
- Distance: ₵4.50
- Eligible subtotal: ₵43.50
- Peak adjustment: ₵8.70 (₵43.50 × 0.2)
- Subtotal: ₵52.20
- Request: ₵1
- Total: ₵53.20
```

---

## Error Handling

### Quote Expired
```javascript
if (new Date(quote.expires_at) < new Date()) {
  // Re-fetch quote
  await fetchQuote();
}
```

### No Collectors Available
```json
{
  "error": "NO_COLLECTORS_AVAILABLE",
  "message": "No collectors available within 10km radius",
  "fallback_quote": {
    // Client-side estimate without distance
  }
}
```

### Server Error
```javascript
catch (error) {
  // Fallback to client-side estimate
  const fallback = getCostBreakdown({ ... });
  setQuote({ pricing: fallback, breakdown_visible: fallback.display });
  
  // Show warning to user
  toast.warning("Using estimated pricing. Actual cost may vary.");
}
```

---

## Migration Checklist

- [ ] Implement `/api/digital-bins/quote` endpoint
- [ ] Add surge detection logic
- [ ] Implement nearest collector GPS query
- [ ] Create `digital_bin_quotes` table
- [ ] Update ReviewStep.js to fetch server quotes
- [ ] Add quote expiry validation
- [ ] Add real-time quote refresh on urgent toggle
- [ ] Test all pricing scenarios
- [ ] Deploy server-side changes
- [ ] Monitor quote accuracy vs. final charges

---

## SOP v4.5.6 Compliance Checklist

✅ **Urgent surcharge**: 30% of Base (not 10%)
✅ **Distance billing**: Only when Urgent ON, >5-10km, 0.06×Base per km
✅ **Surge multiplier**: Hidden from user; show "Peak time adjustment"
✅ **Request fee**: ₵1 per request
✅ **Discount cap**: Max 80% of Core
✅ **Conditional display**: Hide line items if 0
✅ **Distance anchoring**: T₀/T₁/T₂ only-down rule
✅ **Taxes**: 0% for now
✅ **Quote validity**: 60 seconds

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-20  
**SOP Version**: 4.5.6
