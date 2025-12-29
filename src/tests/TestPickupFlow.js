import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TestPickupFlow = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    weight: '',
    notes: '',
    paymentMethod: 'card',
    rating: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Test data from QR code
  const testPickupData = {
    pickupId: "pickup_1752179056372_ochwm6mgc",
    userId: "af295743-e6e1-49e0-a270-07be0f9f5055",
    timestamp: 1752179056372,
    locationId: "local_1752179056372",
    offline: false
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate API call
    try {
      // Here you would normally call your API
      console.log('Submitting pickup data:', { ...testPickupData, ...formData });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setStep(1); // Move to payment step
    } catch (err) {
      setError('Failed to submit pickup. Please try again.');
      console.error('Error submitting pickup:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    
    // Simulate payment processing
    try {
      console.log('Processing payment for pickup:', testPickupData.pickupId);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setStep(2); // Move to rating step
    } catch (err) {
      setError('Payment failed. Please try again.');
      console.error('Payment error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRating = async () => {
    setLoading(true);
    
    // Simulate rating submission
    try {
      console.log('Submitting rating:', formData.rating);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSuccess('Thank you for your feedback!');
      
      // Navigate back to home after a delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      setError('Failed to submit rating. Please try again.');
      console.error('Rating error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Pickup Details Step
  if (step === 0) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Pickup Details</h2>
        
        <div className="mb-6 p-4 bg-gray-50 rounded-md">
          <p className="mb-2"><span className="font-semibold">Pickup ID:</span> {testPickupData.pickupId}</p>
          <p className="mb-2"><span className="font-semibold">Location ID:</span> {testPickupData.locationId}</p>
          <p><span className="font-semibold">Time:</span> {new Date(testPickupData.timestamp).toLocaleString()}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
            <input
              type="number"
              name="weight"
              value={formData.weight}
              onChange={handleInputChange}
              className="w-full p-2 border rounded-md"
              required
              min="0"
              step="0.1"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              className="w-full p-2 border rounded-md h-24"
              placeholder="Any additional notes..."
            />
          </div>
          
          {error && <p className="text-red-500 text-sm">{error}</p>}
          
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 px-4 rounded-md text-white font-medium ${
              loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Processing...' : 'Continue to Payment'}
          </button>
        </form>
      </div>
    );
  }

  // Payment Step
  if (step === 1) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Payment</h2>
        
        <div className="mb-6 p-4 bg-gray-50 rounded-md">
          <p className="text-lg font-semibold mb-2">Order Summary</p>
          <p className="flex justify-between mb-1">
            <span>Weight:</span>
            <span>{formData.weight} kg</span>
          </p>
          <p className="flex justify-between text-lg font-bold mt-2 pt-2 border-t">
            <span>Total:</span>
            <span>${(parseFloat(formData.weight || 0) * 0.5).toFixed(2)}</span>
          </p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
            <input
              type="text"
              placeholder="1234 5678 9012 3456"
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="text"
                placeholder="MM/YY"
                className="w-full p-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CVC</label>
              <input
                type="text"
                placeholder="123"
                className="w-full p-2 border rounded-md"
              />
            </div>
          </div>
          
          {error && <p className="text-red-500 text-sm">{error}</p>}
          
          <button
            onClick={handlePayment}
            disabled={loading}
            className={`w-full py-2 px-4 rounded-md text-white font-medium ${
              loading ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {loading ? 'Processing...' : 'Pay Now'}
          </button>
        </div>
      </div>
    );
  }

  // Rating Step
  if (step === 2) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">How was your experience?</h2>
        
        <div className="flex justify-center space-x-2 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setFormData(prev => ({ ...prev, rating: star }))}
              className={`text-4xl ${star <= formData.rating ? 'text-yellow-400' : 'text-gray-300'}`}
              disabled={loading}
            >
              ★
            </button>
          ))}
        </div>
        
        {success ? (
          <div className="text-center">
            <p className="text-green-600 font-medium mb-4">{success}</p>
            <p className="text-sm text-gray-500">Redirecting to home page...</p>
          </div>
        ) : (
          <button
            onClick={handleRating}
            disabled={loading || formData.rating === 0}
            className={`w-full py-2 px-4 rounded-md text-white font-medium ${
              loading || formData.rating === 0 ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {loading ? 'Submitting...' : 'Submit Rating'}
          </button>
        )}
        
        {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
      </div>
    );
  }

  return null;
};

export default TestPickupFlow;
