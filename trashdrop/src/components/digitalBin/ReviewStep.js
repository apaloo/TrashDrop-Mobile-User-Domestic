import React, { useState, useEffect } from 'react';
import { getCostBreakdown, getCostBreakdownWithGPS, formatCurrency, getBinSizeLabelShort } from '../../utils/costCalculator';
import { getPromotionalFee } from '../../services/promotionalService.js';

const ReviewStep = ({ formData, prevStep, handleSubmit, promoState = {} }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [promoFee, setPromoFee] = useState(null); // promotional fee for current bin size
  
  const isPromotional = promoState?.isEligible === true;
  const promoRemaining = isPromotional ? (promoState.maxRequests - promoState.usedCount) : 0;

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
        
        console.error('[ReviewStep] GPS pricing failed, using default:', error);
        // Fallback to synchronous pricing
        const fallbackBreakdown = getCostBreakdown({
          bin_size_liters: formData.bin_size_liters,
          frequency: formData.frequency,
          waste_type: formData.wasteType || formData.waste_type,
          is_urgent: formData.is_urgent,
          bag_count: formData.numberOfBags || formData.bag_count || 1,
          distance_km: 0,
          on_site_charges: 0,
          discount_amount: 0
        });
        setCostBreakdown(fallbackBreakdown);
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
  }, [formData.bin_size_liters, formData.latitude, formData.longitude, formData.frequency, formData.wasteType, formData.waste_type, formData.is_urgent, formData.numberOfBags, formData.bag_count]);
  
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
  const canSubmit = missingRequirements.length === 0 && !isSubmitting;

  // Handle form submission
  const onSubmit = async () => {
    if (missingRequirements.length > 0) return;
    setIsSubmitting(true);
    try {
      await handleSubmit();
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSubmitting(false);
    }
  };
  
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Review & Submit</h2>
      
      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Digital Bin Location</h3>
        <p className="text-gray-900 font-medium">
          {formData.address || 'Custom location'}
        </p>
        <div className="text-sm text-gray-700 font-medium mt-1">
          Coordinates: {formData.latitude?.toFixed(6)}, {formData.longitude?.toFixed(6)}
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Service Schedule</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-sm text-gray-700 font-medium">Frequency:</span>
            <p className="text-gray-900 font-medium">{formatFrequency(formData.frequency)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-700 font-medium">Start Date:</span>
            <p className="text-gray-900 font-medium">{formData.startDate}</p>
          </div>
          {!formData.is_urgent && (
            <div>
              <span className="text-sm text-gray-700 font-medium">Preferred Time:</span>
              <p className="text-gray-900 font-medium">{formatPreferredTime(formData.preferredTime)}</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">Waste Details</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-sm text-gray-700 font-medium">Number of Bins:</span>
            <p className="text-gray-900 font-medium">{formData.numberOfBags} Bin{formData.numberOfBags > 1 ? 's' : ''}</p>
          </div>
          <div>
            <span className="text-sm text-gray-700 font-medium">Bin Size:</span>
            <p className="text-gray-900 font-medium">{getBinSizeLabelShort(formData.bin_size_liters)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-700 font-medium">Waste Type:</span>
            <p className="text-gray-900 font-medium">{formatWasteType(formData.wasteType)}</p>
          </div>
          {formData.is_urgent && (
            <div className="col-span-2 mt-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                ⚡ Urgent Priority
              </span>
            </div>
          )}
        </div>
      </div>
      
      {formData.notes && (
        <div className="bg-gray-50 p-4 rounded-md mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-900">Additional Notes</h3>
          <p className="text-gray-900 font-medium whitespace-pre-wrap">{formData.notes}</p>
        </div>
      )}
      
      {formData.photos && formData.photos.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-md mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-900">Digital Bin Area Photos</h3>
          <div className="grid grid-cols-3 gap-2">
            {formData.photos.map((photo, index) => (
              <div key={index} className="relative aspect-square">
                <img 
                  src={photo} 
                  alt={`Digital Bin Area ${index + 1}`}
                  className="w-full h-full object-cover rounded-lg border border-gray-200"
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {formData.photos.length} photo{formData.photos.length > 1 ? 's' : ''} attached
          </p>
        </div>
      )}
      


      <div className="bg-blue-50 p-4 rounded-md mb-6 border border-blue-200">
        <h3 className="text-lg font-semibold mb-3 text-gray-900">
          {isPromotional && promoFee?.clientFee != null ? 'Promotional Price' : 'Estimated Cost'}
        </h3>
        
        {isLoadingPrice || (!costBreakdown && !isPromotional) ? (
          <div className="bg-white p-3 rounded-md mb-3 flex items-center justify-center py-8">
            <span className="inline-block animate-spin mr-2 text-2xl">⟳</span>
            <span className="text-gray-600">Calculating price...</span>
          </div>
        ) : isPromotional && promoFee?.clientFee != null ? (
          /* ---- Promotional flat-fee display ---- */
          <>
            <div className="bg-purple-50 border border-purple-200 rounded-md p-2 mb-3 text-sm">
              <span className="text-purple-800 font-medium">🎁 Promotional pricing applied (request {promoState.usedCount + 1} of {promoState.maxRequests})</span>
            </div>
            <div className="bg-white p-3 rounded-md mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 font-medium">
                  {getBinSizeLabelShort(formData.bin_size_liters)} — Promotional Rate
                </span>
                <span className="text-sm text-purple-700 font-semibold">
                  {formatCurrency(promoFee.clientFee)}
                </span>
              </div>
              {costBreakdown && (
                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span>Standard price</span>
                  <span className="line-through">{formatCurrency(costBreakdown.total)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center pt-3 border-t-2 border-purple-300">
              <span className="text-lg font-semibold text-gray-900">TOTAL</span>
              <span className="text-3xl font-bold text-purple-700">
                {formatCurrency(promoFee.clientFee)}
              </span>
            </div>
          </>
        ) : (
          /* ---- Standard SOP pricing display ---- */
          <>
            {!costBreakdown && (
              <div className="text-center py-4 text-gray-500 text-sm">Calculating price...</div>
            )}
            {/* GPS Pricing indicator */}
            {costBreakdown?.pricing_source === 'gps' && costBreakdown?.pricing_zone && (
              <div className="bg-green-100 border border-green-300 rounded-md p-2 mb-3 text-sm">
                <span className="text-green-800 font-medium">📍 Location-based pricing for {costBreakdown.pricing_zone.suburb || costBreakdown.pricing_zone.community}</span>
              </div>
            )}
            
            {costBreakdown && (
              <>
                {/* Line items breakdown */}
                <div className="bg-white p-3 rounded-md mb-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700 font-medium">
                      Base ({getBinSizeLabelShort(formData.bin_size_liters)} × {formData.numberOfBags})
                    </span>
                    <span className="text-sm text-gray-900 font-semibold">
                      {formatCurrency(costBreakdown.base)}
                    </span>
                  </div>
                  
                  {/* Conditional: Show urgent charge only if applicable */}
                  {costBreakdown.display?.urgent_charge && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 font-medium">
                        Urgent surcharge (30%)
                      </span>
                      <span className="text-sm text-yellow-700 font-semibold">
                        {formatCurrency(costBreakdown.urgent_charge)}
                      </span>
                    </div>
                  )}
                  
                  {/* Conditional: Show distance charge only if applicable */}
                  {costBreakdown.display?.distance_charge && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 font-medium">
                        Distance ({costBreakdown.billable_km.toFixed(1)} km)
                      </span>
                      <span className="text-sm text-gray-900 font-semibold">
                        {formatCurrency(costBreakdown.distance_charge)}
                      </span>
                    </div>
                  )}
                  
                  {/* Conditional: Show on-site charges only if applicable */}
                  {costBreakdown.display?.on_site_charges && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 font-medium">
                        On-site charges
                      </span>
                      <span className="text-sm text-gray-900 font-semibold">
                        {formatCurrency(costBreakdown.on_site_charges)}
                      </span>
                    </div>
                  )}
                  
                  {/* Conditional: Show discount only if applicable */}
                  {costBreakdown.display?.discount && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-green-700 font-medium">
                        Discount
                      </span>
                      <span className="text-sm text-green-700 font-semibold">
                        -{formatCurrency(costBreakdown.discount_applied)}
                      </span>
                    </div>
                  )}
                  
                  {/* Always show request fee */}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="text-sm text-gray-700 font-medium">
                      Request fee
                    </span>
                    <span className="text-sm text-gray-900 font-semibold">
                      {formatCurrency(costBreakdown.request_fee)}
                    </span>
                  </div>
                </div>
                
                {/* Total */}
                <div className="flex justify-between items-center pt-3 border-t-2 border-blue-300">
                  <span className="text-lg font-semibold text-gray-900">TOTAL</span>
                  <span className="text-3xl font-bold text-primary">
                    {formatCurrency(costBreakdown.total)}
                  </span>
                </div>
              </>
            )}
          </>
        )}
        
        <p className="text-xs text-gray-600 mt-3 italic">
          {isPromotional && promoFee?.clientFee != null
            ? '🎁 Promotional flat rate — no additional charges.'
            : '⚠️ Estimate only. Final price calculated at confirmation.'}
        </p>
      </div>
      
      {missingRequirements.length > 0 && (
        <div
          id="review-missing-requirements"
          className="mt-6 p-4 rounded-md bg-amber-50 border border-amber-300"
          role="status"
        >
          <p className="text-sm font-semibold text-amber-900">
            Add the following before you can submit:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            {missingRequirements.map(requirement => (
              <li key={requirement} className="text-sm text-amber-800">{requirement}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={prevStep}
          disabled={isSubmitting}
          className="px-6 py-2 border border-gray-300 text-gray-900 font-medium rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-describedby={missingRequirements.length > 0 ? 'review-missing-requirements' : undefined}
          title={missingRequirements.length > 0 ? `Still needed: ${missingRequirements.join('; ')}` : undefined}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <span className="inline-block animate-spin mr-2">⟳</span>
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
