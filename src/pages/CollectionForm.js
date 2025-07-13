import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';

const CollectionForm = () => {
  const { collectionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collection, setCollection] = useState(null);
  const [formData, setFormData] = useState({
    bagsCollected: 1,
    totalTrash: '',
    paymentMethod: 'cash',
    mobileNumber: '',
    rating: 0,
    feedback: ''
  });
  const [step, setStep] = useState(0); // 0: Collection details, 1: Payment, 2: Success
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [collectorInfo, setCollectorInfo] = useState(null);

  // Calculate charge based on number of bags (5 GHS per bag)
  const charge = formData.bagsCollected * 5;

  // Fetch collection details
  useEffect(() => {
    const fetchCollection = async () => {
      try {
        setLoading(true);
        
        // Get collection details
        const { data, error } = await supabase
          .from('collections')
          .select('*, collector:profiles(*)')
          .eq('id', collectionId)
          .single();
          
        if (error) throw error;
        
        if (data.status !== 'processing') {
          throw new Error('This collection is not ready for processing');
        }
        
        setCollection(data);
        setCollectorInfo(data.collector);
        
      } catch (err) {
        console.error('Error fetching collection:', err);
        setError(err.message || 'Failed to load collection details');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCollection();
    
    // Set up real-time subscription for collection updates
    const subscription = supabase
      .channel(`collection_${collectionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'collections',
        filter: `id=eq.${collectionId}`
      }, (payload) => {
        // Handle any updates to the collection
        if (payload.new.status === 'completed') {
          // If collection was completed (e.g., by another device), show success
          setStep(2);
        }
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [collectionId]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'bagsCollected' || name === 'rating' ? parseInt(value, 10) : value
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (step === 0) {
      // If payment method is cash, skip to success
      if (formData.paymentMethod === 'cash') {
        setStep(2);
      } else {
        setStep(1); // Go to payment step
      }
    } else if (step === 1) {
      // Process payment
      if (formData.paymentMethod === 'momo' && !formData.mobileNumber) {
        setError('Mobile number is required for MoMo payment');
        return;
      }
      
      await completeCollection();
    }
  };
  
  const completeCollection = async () => {
    try {
      setSubmitting(true);
      
      // In a real app, you would process the payment here
      // For now, we'll just update the collection status
      const { error } = await supabase
        .from('collections')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          bags_collected: formData.bagsCollected,
          total_charge: charge,
          payment_method: formData.paymentMethod,
          mobile_number: formData.mobileNumber || null,
          rating: formData.rating,
          feedback: formData.feedback
        })
        .eq('id', collectionId);
        
      if (error) throw error;
      
      setSuccess(true);
      setStep(2);
      
    } catch (err) {
      console.error('Error completing collection:', err);
      setError(err.message || 'Failed to complete collection');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleRatingChange = (rating) => {
    setFormData(prev => ({
      ...prev,
      rating
    }));
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <LoadingSpinner />
        <p className="ml-3 text-gray-600">Loading collection details...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
        <button
          onClick={() => window.history.back()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Go Back
        </button>
      </div>
    );
  }
  
  // Collection details form
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Collection Details</h2>
            <p className="text-gray-600">Please enter the collection information</p>
          </div>
          
          {collectorInfo && (
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-blue-800 mb-2">Collector Information:</h3>
              <p className="text-blue-700">
                {collectorInfo.full_name || 'Collector'}
                {collectorInfo.phone_number && ` • ${collectorInfo.phone_number}`}
              </p>
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="bagsCollected" className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Bags Collected
                </label>
                <input
                  type="number"
                  id="bagsCollected"
                  name="bagsCollected"
                  min="1"
                  value={formData.bagsCollected}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="totalTrash" className="block text-sm font-medium text-gray-700 mb-1">
                  Total Trash (kg)
                </label>
                <input
                  type="number"
                  id="totalTrash"
                  name="totalTrash"
                  min="0.1"
                  step="0.1"
                  value={formData.totalTrash}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Payment Method</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={formData.paymentMethod === 'cash'}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="ml-2 text-gray-700">Cash</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="momo"
                      checked={formData.paymentMethod === 'momo'}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="ml-2 text-gray-700">Mobile Money (MoMo)</span>
                  </label>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between text-lg font-medium">
                  <span>Total Charge:</span>
                  <span className="text-blue-600">GHS {charge.toFixed(2)}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">Rate: GHS 5.00 per bag</p>
              </div>
              
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors ${submitting ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {submitting ? 'Processing...' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
  
  // Payment step (only for MoMo)
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Mobile Money Payment</h2>
            <p className="text-gray-600">Enter your mobile money details to receive payment</p>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="mobileNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Number
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">+233</span>
                  </div>
                  <input
                    type="tel"
                    id="mobileNumber"
                    name="mobileNumber"
                    placeholder="54 123 4567"
                    value={formData.mobileNumber}
                    onChange={handleInputChange}
                    className="pl-14 w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Enter your mobile money number to receive payment</p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-gray-700">Amount to receive:</span>
                  <span className="font-medium text-blue-700">GHS {charge.toFixed(2)}</span>
                </div>
              </div>
              
              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex-1 py-3 px-4 border border-gray-300 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors ${submitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {submitting ? 'Processing...' : 'Complete Payment'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }
  
  // Success step
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6 text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h2 className="mt-4 text-2xl font-bold text-gray-900">Collection Complete!</h2>
        <p className="mt-2 text-gray-600">Thank you for using TrashDrop</p>
        
        <div className="mt-6 bg-gray-50 p-4 rounded-lg text-left">
          <h3 className="font-medium text-gray-900">Transaction Details</h3>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Bags Collected:</span>
              <span className="font-medium">{formData.bagsCollected}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Weight:</span>
              <span className="font-medium">{formData.totalTrash} kg</span>
            </div>
            <div className="flex justify-between">
              <span>Payment Method:</span>
              <span className="font-medium capitalize">{formData.paymentMethod}</span>
            </div>
            {formData.paymentMethod === 'momo' && formData.mobileNumber && (
              <div className="flex justify-between">
                <span>Mobile Number:</span>
                <span className="font-medium">+233 {formData.mobileNumber}</span>
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-gray-200 flex justify-between text-base font-medium">
              <span>Amount Received:</span>
              <span className="text-blue-600">GHS {charge.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Rate Your Experience</h3>
          <div className="flex justify-center space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => handleRatingChange(star)}
                className={`text-3xl ${star <= formData.rating ? 'text-yellow-400' : 'text-gray-300'}`}
              >
                {star <= formData.rating ? '★' : '☆'}
              </button>
            ))}
          </div>
          
          {formData.rating > 0 && (
            <div className="mt-4">
              <textarea
                name="feedback"
                rows="3"
                value={formData.feedback}
                onChange={handleInputChange}
                placeholder="Any additional feedback? (Optional)"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={completeCollection}
                disabled={submitting}
                className="mt-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          )}
        </div>
        
        <div className="mt-8">
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollectionForm;
