import React, { useState, useEffect } from 'react';
import { FaStar, FaCheckCircle, FaTimesCircle, FaSpinner, FaArrowLeft, FaMoneyBillWave } from 'react-icons/fa';
import supabase from '../../supabaseClient';

export const PaymentAndRating = ({ 
  pickup, 
  collector, 
  onComplete, 
  onBack 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('payment'); // 'payment' or 'rating'
  const [paymentMethod, setPaymentMethod] = useState('wallet'); // 'wallet' or 'cash'
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({
    amount: 0,
    fee: 0,
    total: 0
  });
  const [walletBalance, setWalletBalance] = useState(0);
  const [insufficientFunds, setInsufficientFunds] = useState(false);

  // Calculate payment details when component mounts
  useEffect(() => {
    calculatePayment();
    fetchWalletBalance();
  }, []);

  // Calculate payment amount based on pickup details
  const calculatePayment = () => {
    // In a real app, this would be calculated based on the pickup details
    const baseAmount = 15.00; // Base amount
    const fee = 1.50; // Service fee
    const total = baseAmount + fee;
    
    setPaymentDetails({
      amount: baseAmount,
      fee,
      total
    });
    
    return total;
  };

  // Fetch user's wallet balance
  const fetchWalletBalance = async () => {
    try {
      // In a real app, this would fetch the actual wallet balance
      // For demo purposes, we'll use a mock balance
      const balance = 20.00; // Mock balance
      setWalletBalance(balance);
      
      // Check if balance is sufficient
      const total = calculatePayment();
      setInsufficientFunds(balance < total);
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      setError('Failed to load wallet balance');
    }
  };

  // Process payment
  const processPayment = async () => {
    setLoading(true);
    setError('');
    
    try {
      if (paymentMethod === 'wallet' && insufficientFunds) {
        setError('Insufficient funds in your wallet. Please choose another payment method.');
        setLoading(false);
        return;
      }
      
      // In a real app, this would process the payment through a payment gateway
      // For demo purposes, we'll simulate a successful payment
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setPaymentComplete(true);
      setStep('rating');
    } catch (error) {
      console.error('Payment error:', error);
      setError(error.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Submit rating and review
  const submitRating = async () => {
    setLoading(true);
    setError('');
    
    try {
      // In a real app, this would save the rating and review to the database
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update the pickup with the rating and review
      const { error } = await supabase
        .from('scheduled_pickups')
        .update({
          collector_rating: rating,
          collector_review: review.trim() || null,
          rated_at: new Date().toISOString()
        })
        .eq('id', pickup.id);
      
      if (error) throw error;
      
      // Call the onComplete callback to notify the parent component
      onComplete({
        payment: {
          ...paymentDetails,
          method: paymentMethod,
          status: 'completed'
        },
        rating,
        review: review.trim() || null
      });
    } catch (error) {
      console.error('Error submitting rating:', error);
      setError('Failed to submit rating. Please try again.');
      setLoading(false);
    }
  };

  // Render payment step
  const renderPaymentStep = () => (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-td-border">
        <h3 className="text-lg font-medium text-td-ink mb-4">Payment Summary</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-td-sage">Service Fee</span>
            <span className="font-medium">${paymentDetails.amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-td-sage">Service Fee</span>
            <span className="text-td-sage">${paymentDetails.fee.toFixed(2)}</span>
          </div>
          <div className="border-t border-td-border my-2"></div>
          <div className="flex justify-between font-medium text-lg">
            <span>Total</span>
            <span>${paymentDetails.total.toFixed(2)}</span>
          </div>
        </div>
        
        <div className="mt-6">
          <h4 className="text-sm font-medium text-td-ink mb-3">Payment Method</h4>
          
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setPaymentMethod('wallet')}
              className={`w-full p-4 rounded-lg border-2 ${paymentMethod === 'wallet' 
                ? 'border-primary bg-primary/5' 
                : 'border-td-border hover:border-gray-300'} transition-colors text-left`}
            >
              <div className="flex items-center">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 ${paymentMethod === 'wallet' ? 'border-primary bg-primary' : 'border-td-border-strong'}`}>
                  {paymentMethod === 'wallet' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div>
                  <p className="font-medium">TrashDrop Wallet</p>
                  <p className="text-sm text-td-sage">
                    Balance: ${walletBalance.toFixed(2)}
                    {insufficientFunds && paymentMethod === 'wallet' && (
                      <span className="text-red-500 ml-2">Insufficient funds</span>
                    )}
                  </p>
                </div>
              </div>
            </button>
            
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={`w-full p-4 rounded-lg border-2 ${paymentMethod === 'cash' 
                ? 'border-primary bg-primary/5' 
                : 'border-td-border hover:border-gray-300'} transition-colors text-left`}
            >
              <div className="flex items-center">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 ${paymentMethod === 'cash' ? 'border-primary bg-primary' : 'border-td-border-strong'}`}>
                  {paymentMethod === 'cash' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div>
                  <p className="font-medium">Pay with Cash</p>
                  <p className="text-sm text-td-sage">Pay the collector directly</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <FaTimesCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex space-x-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 bg-gray-100 text-td-ink py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center justify-center"
          disabled={loading}
        >
          <FaArrowLeft className="mr-2" />
          Back
        </button>
        <button
          type="button"
          onClick={processPayment}
          className="flex-1 bg-primary text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-dark transition-colors flex items-center justify-center"
          disabled={loading || (paymentMethod === 'wallet' && insufficientFunds)}
        >
          {loading ? (
            <>
              <FaSpinner className="animate-spin mr-2" />
              Processing...
            </>
          ) : (
            <>
              <FaMoneyBillWave className="mr-2" />
              Pay ${paymentDetails.total.toFixed(2)}
            </>
          )}
        </button>
      </div>
    </div>
  );

  // Render rating step
  const renderRatingStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <FaCheckCircle className="text-green-700 text-3xl" />
        </div>
        <h3 className="text-lg font-medium text-td-ink mb-2">Payment Successful!</h3>
        <p className="text-td-sage mb-6">
          Thank you for your payment. How was your experience with {collector.name || 'the collector'}?
        </p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border border-td-border">
        <div className="flex justify-center mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="text-3xl mx-1 focus:outline-none"
              aria-label={`Rate ${star} star`}
            >
              <FaStar
                className={star <= rating ? 'text-yellow-400' : 'text-gray-300'}
              />
            </button>
          ))}
        </div>
        
        <div className="mt-4">
          <label htmlFor="review" className="block text-sm font-medium text-td-ink mb-1">
            Add a review (optional)
          </label>
          <textarea
            id="review"
            rows="3"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            className="w-full px-3 py-2 border border-td-border-strong rounded-lg focus:ring-primary focus:border-primary"
            placeholder="Share your experience..."
          ></textarea>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <FaTimesCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex space-x-3">
        <button
          type="button"
          onClick={() => setStep('payment')}
          className="flex-1 bg-gray-100 text-td-ink py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          disabled={loading}
        >
          Back
        </button>
        <button
          type="button"
          onClick={submitRating}
          className="flex-1 bg-primary text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-dark transition-colors flex items-center justify-center"
          disabled={loading}
        >
          {loading ? (
            <>
              <FaSpinner className="animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            'Submit Review'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto p-4">
      {step === 'payment' ? renderPaymentStep() : renderRatingStep()}
    </div>
  );
};

export default PaymentAndRating;
