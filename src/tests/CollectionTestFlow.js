import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const CollectionTestFlow = () => {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    bagsCollected: '',
    totalTrash: '',
    paymentMethod: 'cash',
    mobileNumber: '',
    rating: 0
  });
  
  const [charge, setCharge] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(30);
  const RATE_PER_BAG = 5; // 5 GHS per bag

  // Calculate charge whenever bags collected changes
  useEffect(() => {
    if (formData.bagsCollected === '') {
      setCharge(0);
    } else {
      const bags = parseInt(formData.bagsCollected, 10) || 0;
      setCharge(bags * RATE_PER_BAG);
    }
  }, [formData.bagsCollected]);

  // Countdown timer for redirection
  useEffect(() => {
    if (step === 2) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            window.location.href = '/dashboard';
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'bagsCollected') {
      // Only allow numbers and empty string
      if (value === '' || /^\d+$/.test(value)) {
        setFormData(prev => ({
          ...prev,
          [name]: value
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleCollectionSubmit = (e) => {
    e.preventDefault();
    
    // Validate bags collected
    if (!formData.bagsCollected || parseInt(formData.bagsCollected, 10) <= 0) {
      setError('Please enter a valid number of bags');
      return;
    }
    
    // Validate total trash amount
    if (!formData.totalTrash || parseFloat(formData.totalTrash) <= 0) {
      setError('Please enter a valid total trash amount');
      return;
    }
    
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      
      // Skip payment step if payment method is cash
      if (formData.paymentMethod === 'cash') {
        handlePaymentSubmit(e, true); // Pass true to skip the payment page
      } else {
        setStep(1); // Move to payment step for MoMo
      }
    }, 1000);
  };

  const handlePaymentSubmit = async (e, skipPage = false) => {
    if (e) e.preventDefault();
    setLoading(true);
    
    // Only validate mobile number if we're on the MoMo payment page
    if (!skipPage && formData.paymentMethod === 'momo' && !formData.mobileNumber) {
      setError('Please enter a mobile number for MoMo payment');
      setLoading(false);
      return;
    }
    
    // Simulate payment processing
    try {
      console.log('Processing payment:', {
        bags: formData.bagsCollected,
        amount: charge,
        method: formData.paymentMethod,
        ...(formData.paymentMethod === 'momo' && { mobile: formData.mobileNumber })
      });
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      setStep(2); // Show success and rating
    } catch (err) {
      setError('Payment failed. Please try again.');
      console.error('Payment error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRatingSubmit = async (rating) => {
    setLoading(true);
    
    try {
      console.log('Submitting rating:', rating);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setFormData(prev => ({ ...prev, rating }));
    } catch (err) {
      setError('Failed to submit rating. Please try again.');
      console.error('Rating error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Collection Form
  if (step === 0) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-1">Collection Details</h2>
          <div className="flex justify-center space-x-2 mb-6">
            <div className="w-8 h-1.5 bg-blue-600 rounded-full"></div>
            <div className="w-8 h-1.5 bg-gray-200 rounded-full"></div>
            <div className="w-8 h-1.5 bg-gray-200 rounded-full"></div>
          </div>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <form onSubmit={handleCollectionSubmit} className="space-y-4">
          <div className="border border-gray-200 rounded-xl p-6 bg-gray-50">
            <div className="mb-6">
              <label className="block text-gray-700 text-lg font-medium mb-3">
                Actual Bags Collected
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  name="bagsCollected"
                  value={formData.bagsCollected}
                  onChange={handleInputChange}
                  className={`w-full p-4 text-lg border ${
                    error && !formData.bagsCollected ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="Enter number of bags"
                  required
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                  Bags
                </div>
              </div>
            </div>
            
            <div className="mb-6 p-5 bg-white rounded-xl border border-gray-200">
              <div className="h-px bg-gray-100 my-3"></div>
                <div className="flex flex-col space-y-2">
                <label className="text-gray-800 font-medium">How much is the total trash:</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={formData.totalTrash || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      totalTrash: e.target.value
                    }))}
                    className="w-full p-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    placeholder="0.00"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 font-medium">
                    GHS
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mb-4">
              <p className="font-semibold mb-2">Payment Method:</p>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={formData.paymentMethod === 'cash'}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  Cash
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="momo"
                    checked={formData.paymentMethod === 'momo'}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  MoMo
                </label>
              </div>
              
              {formData.paymentMethod === 'momo' && (
                <div className="mt-2">
                  <input
                    type="tel"
                    name="mobileNumber"
                    placeholder="Mobile Number"
                    value={formData.mobileNumber}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              )}
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading || !formData.bagsCollected || !formData.totalTrash}
            className={`w-full py-4 px-6 text-lg font-medium text-white rounded-xl shadow-md ${
              loading || !formData.bagsCollected || !formData.totalTrash 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 transition-colors'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : formData.paymentMethod === 'cash' ? 'Complete Collection' : 'Continue to Payment'}
          </button>
        </form>
      </div>
    );
  }

  // Payment Step
  if (step === 1) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-1">Payment</h2>
          <div className="flex justify-center space-x-2 mb-6">
            <div className="w-8 h-1.5 bg-gray-200 rounded-full"></div>
            <div className="w-8 h-1.5 bg-blue-600 rounded-full"></div>
            <div className="w-8 h-1.5 bg-gray-200 rounded-full"></div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-6 rounded-xl mb-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-700">Bags Collected:</span>
            <span className="font-medium">{formData.bagsCollected}</span>
          </div>
          <div className="flex justify-between items-center text-lg font-semibold">
            <span>Total Amount:</span>
            <span className="text-blue-600">GHS {charge.toFixed(2)}</span>
          </div>
        </div>
        
        <form onSubmit={handlePaymentSubmit}>
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-800 mb-3">Payment Method</h3>
              <div className="space-y-3">
                <label className="flex items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={formData.paymentMethod === 'cash'}
                    onChange={handleInputChange}
                    className="h-5 w-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-3 block text-sm font-medium text-gray-700">
                    Pay with Cash
                  </span>
                </label>
                
                <label className="flex items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="momo"
                    checked={formData.paymentMethod === 'momo'}
                    onChange={handleInputChange}
                    className="h-5 w-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-3 block text-sm font-medium text-gray-700">
                    Mobile Money (MoMo)
                  </span>
                </label>
              </div>
              
              {formData.paymentMethod === 'momo' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    name="mobileNumber"
                    value={formData.mobileNumber}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 0244123456"
                    required={formData.paymentMethod === 'momo'}
                  />
                </div>
              )}
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 px-6 text-lg font-medium text-white rounded-xl shadow-md ${
                loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              } transition-colors`}
            >
              {loading ? 'Processing...' : 'Complete Payment'}
            </button>
            
            <button
              type="button"
              onClick={() => setStep(0)}
              className="w-full py-3 px-6 text-lg font-medium text-blue-600 bg-white border border-blue-600 rounded-xl shadow-sm hover:bg-blue-50 transition-colors"
            >
              Back to Collection
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Success & Rating Step
  if (step === 2) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Payment Successful!</h2>
          <p className="text-gray-600 mb-8 text-lg">
            Thank you for choosing TrashDrop. Your collection has been processed successfully.
          </p>
          
          <div className="bg-gray-50 p-5 rounded-xl mb-8 text-left">
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Bags Collected:</span>
              <span className="font-medium">{formData.bagsCollected}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Total Paid:</span>
              <span className="text-green-600">GHS {charge.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-800 mb-4">How was your experience?</h3>
            <div className="flex justify-center space-x-1 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRatingSubmit(star)}
                  className={`text-4xl transition-transform hover:scale-110 ${
                    star <= formData.rating ? 'text-yellow-400' : 'text-gray-200'
                  }`}
                  disabled={loading || formData.rating > 0}
                >
                  {star <= formData.rating ? '★' : '☆'}
                </button>
              ))}
            </div>
            {formData.rating > 0 ? (
              <div className="text-green-600 font-medium text-lg py-2">
                Thank you for your feedback!
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                Tap a star to rate your experience
              </p>
            )}
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
          
          <p className="text-gray-500 text-sm mt-4">
            You'll be redirected to the dashboard in {countdown} seconds
          </p>
        </div>
      </div>
    );
  }

  // Fallback (should never reach here)
  return null;
};

export default CollectionTestFlow;
