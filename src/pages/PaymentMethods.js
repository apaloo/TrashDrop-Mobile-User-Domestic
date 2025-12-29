import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import PaymentMethodForm from '../components/PaymentMethodForm.js';
import { paymentService } from '../services/paymentService.js';

/**
 * Payment Methods management page
 * Allows users to add, view, and manage their payment methods
 */
const PaymentMethods = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch user's payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!user?.id) return;

      try {
        const { data, error: fetchError } = await paymentService.getUserPaymentMethods(user.id);
        if (fetchError) throw new Error(fetchError.message);
        setPaymentMethods(data);
      } catch (err) {
        console.error('Error fetching payment methods:', err);
        setError('Failed to load payment methods');
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentMethods();
  }, [user]);

  const handlePaymentMethodAdded = (newMethod) => {
    setPaymentMethods(prev => [...prev, newMethod]);
    setShowAddForm(false);
    setError(null);
  };

  const handleSetDefault = async (methodId) => {
    try {
      const { error: setDefaultError } = await paymentService.setDefaultPaymentMethod(user.id, methodId);
      if (setDefaultError) throw new Error(setDefaultError.message);
      
      // Update local state
      setPaymentMethods(prev =>
        prev.map(method => ({
          ...method,
          is_default: method.id === methodId
        }))
      );
    } catch (err) {
      console.error('Error setting default payment method:', err);
      setError('Failed to set default payment method');
    }
  };

  const handleRemove = async (methodId) => {
    if (!window.confirm('Are you sure you want to remove this payment method?')) return;

    try {
      const { error: removeError } = await paymentService.removePaymentMethod(user.id, methodId);
      if (removeError) throw new Error(removeError.message);
      
      // Update local state
      setPaymentMethods(prev => prev.filter(method => method.id !== methodId));
    } catch (err) {
      console.error('Error removing payment method:', err);
      setError('Failed to remove payment method');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Payment Methods
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your payment methods for pickup services
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Existing Payment Methods */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Your Payment Methods
              </h2>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Add New
              </button>
            </div>

            {paymentMethods.length > 0 ? (
              <div className="space-y-4">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {method.type === 'card' && (
                            <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" />
                            </svg>
                          )}
                          {method.type === 'bank' && (
                            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z" clipRule="evenodd" />
                            </svg>
                          )}
                          {method.type === 'mobile' && (
                            <svg className="w-8 h-8 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zM8 5a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {method.provider.charAt(0).toUpperCase() + method.provider.slice(1)}
                            {method.details?.last4 && ` •••• ${method.details.last4}`}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {method.type.charAt(0).toUpperCase() + method.type.slice(1)}
                            {method.is_default && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Default
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!method.is_default && (
                          <button
                            onClick={() => handleSetDefault(method.id)}
                            className="text-sm text-blue-600 hover:text-blue-700"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(method.id)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No payment methods</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Add a payment method to start using our services.
                </p>
              </div>
            )}
          </div>

          {/* Add New Payment Method Form */}
          {showAddForm && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Add Payment Method
                </h2>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <PaymentMethodForm onSuccess={handlePaymentMethodAdded} />
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethods;
