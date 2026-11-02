import React, { useState, useEffect } from 'react';
import { getCostBreakdownWithGPS, formatCurrency, getBinSizeLabelShort } from '../../utils/costCalculator';
import { getPromotionalFee } from '../../services/promotionalService.js';
import { card, infoNote, primaryButton, secondaryButton, sectionTitle, warningNote } from '../ui/styles.js';

// Look only: a summary row and the cost line items
const label = 'text-sm text-td-sage dark:text-gray-300';
const value = 'text-[15px] font-semibold text-td-ink dark:text-gray-100';
const lineLabel = 'text-sm text-td-ink dark:text-gray-200';
const lineAmount = 'text-sm font-semibold text-td-ink dark:text-gray-100 tabular-nums';

const ReviewStep = ({ formData, prevStep, handleSubmit, promoState = {} }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [promoFee, setPromoFee] = useState(null); // promotional fee for current bin size
  // Why this booking cannot be priced ({ reason, message }), or null. There is
  // no default price to fall back on, so a pricing failure blocks submission.
  const [pricingError, setPricingError] = useState(null);
  const [pricingAttempt, setPricingAttempt] = useState(0); // Bumped by "Try again"
  
  // Promotions don't apply to urgent pickups (the database prices them normally)
  const isPromotional = promoState?.isEligible === true && !formData.is_urgent;
  const promoRemaining = isPromotional ? (promoState.maxRequests - promoState.usedCount) : 0;
  const bagCount = Math.max(1, parseInt(formData.numberOfBags || formData.bag_count) || 1);
  const promoTotal = promoFee?.clientFee != null ? promoFee.clientFee * bagCount : null;

  // Fetch promotional fee when bin size changes (if user is promo-eligible)
  useEffect(() => {
    let isCancelled = false;
    if (isPromotional) {
      getPromotionalFee(formData.bin_size_liters).then(fee => {
        if (!isCancelled) setPromoFee(fee);
      });
    }
    return () => { isCancelled = true; };
  }, [isPromotional, formData.bin_size_liters]);

  // Fetch GPS-based pricing on mount with cancellation support
  // (still needed as fallback display even for promo users to show "normally ~GHS X")
  useEffect(() => {
    let isCancelled = false;
    
    const fetchGPSPricing = async () => {
      setIsLoadingPrice(true);
      setPricingError(null);
      try {
        // Use GPS-based pricing with user's location coordinates
        const breakdown = await getCostBreakdownWithGPS({
          bin_size_liters: formData.bin_size_liters,
          latitude: formData.latitude,
          longitude: formData.longitude,
          frequency: formData.frequency,
          waste_type: formData.wasteType || formData.waste_type,
          is_urgent: formData.is_urgent,
          bag_count: formData.numberOfBags || formData.bag_count || 1,
          distance_km: 0,
          on_site_charges: 0,
          discount_amount: 0
        });
        
        // Only update state if component is still mounted
        if (!isCancelled) {
          console.log('[ReviewStep] GPS pricing breakdown:', breakdown);
          setCostBreakdown(breakdown);
        }
      } catch (error) {
        if (isCancelled) return; // Don't update state if cancelled

        console.error('[ReviewStep] Pricing unavailable:', error);
        setCostBreakdown(null);
        setPricingError({
          reason: error.reason || 'lookup_failed',
          message: error.reason
            ? error.message
            : "We couldn't load prices for your location right now. Please try again in a moment."
        });
      } finally {
        if (!isCancelled) {
          setIsLoadingPrice(false);
        }
      }
    };

    fetchGPSPricing();
    
    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isCancelled = true;
    };
  }, [formData.bin_size_liters, formData.latitude, formData.longitude, formData.frequency, formData.wasteType, formData.waste_type, formData.is_urgent, formData.numberOfBags, formData.bag_count, pricingAttempt]);
  
  // Format waste type for display
  const formatWasteType = (type) => {
    switch (type) {
      case 'general':
        return 'General Waste';
      case 'recycling':
        return 'Recycling';
      case 'organic':
        return 'Organic Waste';
      default:
        return type;
    }
  };
  
  // Format preferred time for display
  const formatPreferredTime = (time) => {
    switch (time) {
      case 'morning':
        return 'Morning (8am - 12pm)';
      case 'afternoon':
        return 'Afternoon (12pm - 4pm)';
      case 'evening':
        return 'Evening (4pm - 8pm)';
      default:
        return time;
    }
  };
  
  // Format frequency for display
  const formatFrequency = (freq) => {
    switch (freq) {
      case 'weekly':
        return 'Weekly';
      case 'biweekly':
        return 'Bi-weekly';
      case 'monthly':
        return 'Monthly';
      default:
        return freq;
    }
  };
  
  // Everything the request needs before it can be submitted, with the step that
  // fixes each gap - shown inline so a disabled button is never a dead end
  const missingRequirements = [];
  if (!formData.address || formData.latitude == null || formData.longitude == null) {
    missingRequirements.push('Pickup location and GPS coordinates (Step 1: Location)');
  }
  if (!formData.frequency || !formData.startDate || !formData.preferredTime) {
    missingRequirements.push('Service frequency, start date and preferred time (Step 2: Schedule)');
  }
  if (!formData.numberOfBags || !(formData.wasteType || formData.waste_type) || !formData.bin_size_liters) {
    missingRequirements.push('Number of bins, waste type and bin size (Step 3: Bin details)');
  }
  const canSubmit = missingRequirements.length === 0 && !isSubmitting && !isLoadingPrice && !pricingError;

  // Handle form submission
  const onSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await handleSubmit();
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <section className={`${card} px-4 py-4`}>
        <h2 className={sectionTitle}>Review & Submit</h2>
        <p className={`${label} mt-1`}>Check the details below, then request your pickup.</p>
      </section>

      <section className={`${card} px-4 py-4`}>
        <h3 className={`${sectionTitle} mb-2`}>Digital Bin Location</h3>
        <p className={value}>
          {formData.address || 'Custom location'}
        </p>
        <div className={`${label} mt-1`}>
          Coordinates: {formData.latitude?.toFixed(6)}, {formData.longitude?.toFixed(6)}
        </div>
      </section>
      
      <section className={`${card} px-4 py-4`}>
        <h3 className={`${sectionTitle} mb-3`}>Service Schedule</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Frequency:</span>
            <p className={value}>{formatFrequency(formData.frequency)}</p>
          </div>
          <div>
            <span className={label}>Start Date:</span>
            <p className={value}>{formData.startDate}</p>
          </div>
          {!formData.is_urgent && (
            <div>
              <span className={label}>Preferred Time:</span>
              <p className={value}>{formatPreferredTime(formData.preferredTime)}</p>
            </div>
          )}
        </div>
      </section>
      
      <section className={`${card} px-4 py-4`}>
        <h3 className={`${sectionTitle} mb-3`}>Waste Details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Number of Bins:</span>
            <p className={value}>{formData.numberOfBags} Bin{formData.numberOfBags > 1 ? 's' : ''}</p>
          </div>
          <div>
            <span className={label}>Bin Size:</span>
            <p className={value}>{getBinSizeLabelShort(formData.bin_size_liters)}</p>
          </div>
          <div>
            <span className={label}>Waste Type:</span>
            <p className={value}>{formatWasteType(formData.wasteType)}</p>
          </div>
          {formData.is_urgent && (
            <div className="col-span-2 mt-1">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
                ⚡ Urgent Priority
              </span>
            </div>
          )}
        </div>
      </section>
      
      {formData.notes && (
        <section className={`${card} px-4 py-4`}>
          <h3 className={`${sectionTitle} mb-2`}>Additional Notes</h3>
          <p className="text-[15px] text-td-ink dark:text-gray-100 whitespace-pre-wrap">{formData.notes}</p>
        </section>
      )}
      
      {formData.photos && formData.photos.length > 0 && (
        <section className={`${card} px-4 py-4`}>
          <h3 className={`${sectionTitle} mb-3`}>Digital Bin Area Photos</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {formData.photos.map((photo, index) => (
              <div key={index} className="relative aspect-square">
                <img 
                  src={photo} 
                  alt={`Digital Bin Area ${index + 1}`}
                  className="w-full h-full object-cover rounded-xl border border-td-border dark:border-gray-700"
                />
              </div>
            ))}
          </div>
          <p className={`${label} mt-2`}>
            {formData.photos.length} photo{formData.photos.length > 1 ? 's' : ''} attached
          </p>
        </section>
      )}

      <section className={`${card} px-4 py-4`}>
        <h3 className={`${sectionTitle} mb-3`}>
          {isPromotional && promoFee?.clientFee != null ? 'Promotional Price' : 'Estimated Cost'}
        </h3>
        
        {pricingError && !isLoadingPrice ? (
          <div className={`${warningNote} px-3.5 py-3 mb-3`} role="alert">
            <p className="text-sm font-semibold">{pricingError.message}</p>
            {pricingError.reason === 'not_covered' && (
              <p className="mt-1 text-sm">Go back to Step 1 to check your bin's location.</p>
            )}
            {pricingError.reason === 'size_unpriced' && (
              <p className="mt-1 text-sm">Go back to Step 3 to choose a different bin size.</p>
            )}
            {pricingError.reason === 'lookup_failed' && (
              <button
                type="button"
                onClick={() => setPricingAttempt(attempt => attempt + 1)}
                className="mt-2 text-sm font-semibold underline"
              >
                Try again
              </button>
            )}
          </div>
        ) : isLoadingPrice || (!costBreakdown && !isPromotional) ? (
          <div className="rounded-xl bg-td-cream dark:bg-gray-900/40 mb-3 flex items-center justify-center py-8">
            <span className="inline-block animate-spin mr-2 text-2xl text-td-forest dark:text-green-300" aria-hidden="true">⟳</span>
            <span className={label}>Calculating price...</span>
          </div>
        ) : isPromotional && promoFee?.clientFee != null ? (
          /* ---- Promotional flat-fee display ---- */
          <>
            <div className={`${infoNote} px-3 py-2 mb-3 text-sm font-semibold`}>
              <span>🎁 Promotional pricing applied (request {promoState.usedCount + 1} of {promoState.maxRequests})</span>
            </div>
            <div className="rounded-xl bg-td-cream dark:bg-gray-900/40 px-3.5 py-3 mb-3 space-y-2">
              <div className="flex justify-between items-center gap-3">
                <span className={lineLabel}>
                  {getBinSizeLabelShort(formData.bin_size_liters)} — Promotional Rate × {bagCount}
                </span>
                <span className={lineAmount}>
                  {formatCurrency(promoTotal)}
                </span>
              </div>
              {costBreakdown && (
                <div className={`flex justify-between items-center ${label}`}>
                  <span>Standard price</span>
                  <span className="line-through tabular-nums">{formatCurrency(costBreakdown.total)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-baseline pt-3 border-t border-td-border dark:border-gray-700">
              <span className="text-[15px] font-bold text-td-ink dark:text-gray-100">TOTAL</span>
              <span className="text-[28px] leading-none font-bold text-td-forest dark:text-green-300 tabular-nums">
                {formatCurrency(promoTotal)}
              </span>
            </div>
          </>
        ) : (
          /* ---- Standard SOP pricing display ---- */
          <>
            {promoState?.isEligible && formData.is_urgent && (
              <div className={`${infoNote} px-3 py-2 mb-3 text-sm`}>
                🎁 Promotional pricing doesn't apply to urgent pickups. Untick urgent to use one of your promotional pickups.
              </div>
            )}
            {!costBreakdown && (
              <div className={`text-center py-4 ${label}`}>Calculating price...</div>
            )}
            {/* GPS Pricing indicator */}
            {costBreakdown?.pricing_source === 'gps' && costBreakdown?.pricing_zone && (
              <div className={`${infoNote} px-3 py-2 mb-3 text-sm font-semibold`}>
                <span>📍 Location-based pricing for {costBreakdown.pricing_zone.suburb || costBreakdown.pricing_zone.community}</span>
              </div>
            )}
            
            {costBreakdown && (
              <>
                {/* Line items breakdown */}
                <div className="rounded-xl bg-td-cream dark:bg-gray-900/40 px-3.5 py-3 mb-3 space-y-2">
                  <div className="flex justify-between items-center gap-3">
                    <span className={lineLabel}>
                      Base ({getBinSizeLabelShort(formData.bin_size_liters)} × {formData.numberOfBags})
                    </span>
                    <span className={lineAmount}>
                      {formatCurrency(costBreakdown.base)}
                    </span>
                  </div>
                  
                  {/* Conditional: Show urgent charge only if applicable */}
                  {costBreakdown.display?.urgent_charge && (
                    <div className="flex justify-between items-center gap-3">
                      <span className={lineLabel}>
                        Urgent surcharge (30%)
                      </span>
                      <span className={lineAmount}>
                        {formatCurrency(costBreakdown.urgent_charge)}
                      </span>
                    </div>
                  )}
                  
                  {/* Conditional: Show distance charge only if applicable */}
                  {costBreakdown.display?.distance_charge && (
                    <div className="flex justify-between items-center gap-3">
                      <span className={lineLabel}>
                        Distance ({costBreakdown.billable_km.toFixed(1)} km)
                      </span>
                      <span className={lineAmount}>
                        {formatCurrency(costBreakdown.distance_charge)}
                      </span>
                    </div>
                  )}
                  
                  {/* Conditional: Show on-site charges only if applicable */}
                  {costBreakdown.display?.on_site_charges && (
                    <div className="flex justify-between items-center gap-3">
                      <span className={lineLabel}>
                        On-site charges
                      </span>
                      <span className={lineAmount}>
                        {formatCurrency(costBreakdown.on_site_charges)}
                      </span>
                    </div>
                  )}
                  
                  {/* Conditional: Show discount only if applicable */}
                  {costBreakdown.display?.discount && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-sm text-td-forest dark:text-green-300">
                        Discount
                      </span>
                      <span className="text-sm font-semibold text-td-forest dark:text-green-300 tabular-nums">
                        -{formatCurrency(costBreakdown.discount_applied)}
                      </span>
                    </div>
                  )}
                  
                  {/* Always show request fee */}
                  <div className="flex justify-between items-center gap-3 pt-2 border-t border-td-border dark:border-gray-700">
                    <span className={lineLabel}>
                      Request fee
                    </span>
                    <span className={lineAmount}>
                      {formatCurrency(costBreakdown.request_fee)}
                    </span>
                  </div>
                </div>
                
                {/* Total */}
                <div className="flex justify-between items-baseline pt-3 border-t border-td-border dark:border-gray-700">
                  <span className="text-[15px] font-bold text-td-ink dark:text-gray-100">TOTAL</span>
                  <span className="text-[28px] leading-none font-bold text-td-forest dark:text-green-300 tabular-nums">
                    {formatCurrency(costBreakdown.total)}
                  </span>
                </div>
              </>
            )}
          </>
        )}
        
        <p className={`${label} text-xs mt-3`}>
          {isPromotional && promoFee?.clientFee != null
            ? '🎁 Promotional flat rate — no additional charges.'
            : '⚠️ Estimate only. Final price calculated at confirmation.'}
        </p>
      </section>
      
      {missingRequirements.length > 0 && (
        <div
          id="review-missing-requirements"
          className={`${warningNote} px-4 py-3.5`}
          role="status"
        >
          <p className="text-sm font-semibold">
            Add the following before you can submit:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            {missingRequirements.map(requirement => (
              <li key={requirement} className="text-sm">{requirement}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Back takes only its label's width so "Request Bin Pickup" fits on one line on phones */}
      <div className="grid grid-cols-[auto_1fr] gap-2.5 pt-1">
        <button
          type="button"
          onClick={prevStep}
          disabled={isSubmitting}
          className={secondaryButton}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-describedby={missingRequirements.length > 0 ? 'review-missing-requirements' : undefined}
          title={missingRequirements.length > 0 ? `Still needed: ${missingRequirements.join('; ')}` : undefined}
          className={primaryButton}
        >
          {isSubmitting ? (
            <>
              <span className="inline-block animate-spin" aria-hidden="true">⟳</span>
              Processing...
            </>
          ) : (
            'Request Bin Pickup'
          )}
        </button>
      </div>
    </div>
  );
};

export default ReviewStep;
