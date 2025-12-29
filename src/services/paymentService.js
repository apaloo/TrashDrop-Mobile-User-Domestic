/**
 * Payment service for managing payment methods and processing payments
 */

import supabase from '../utils/supabaseClient.js';

export const paymentService = {
  /**
   * Add a new payment method for a user
   * @param {string} userId - User ID
   * @param {Object} paymentData - Payment method data
   * @returns {Object} Created payment method
   */
  async addPaymentMethod(userId, paymentData) {
    try {
      if (!userId || !paymentData.type) {
        throw new Error('User ID and payment type are required');
      }

      console.log('[PaymentService] Adding payment method for user:', userId);

      // Check if this should be the default method
      const { data: existingMethods } = await supabase
        .from('payment_methods')
        .select('id')
        .eq('user_id', userId);

      const isDefault = !existingMethods || existingMethods.length === 0;

      const paymentMethod = {
        user_id: userId,
        type: paymentData.type,
        provider: paymentData.provider,
        details: paymentData.details, // Encrypted in database via Supabase policies
        is_default: isDefault,
        status: 'active',
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('payment_methods')
        .insert(paymentMethod)
        .select()
        .single();

      if (error) {
        console.error('[PaymentService] Error adding payment method:', error);
        throw error;
      }

      console.log('[PaymentService] Successfully added payment method:', data.id);
      return { data, error: null };

    } catch (error) {
      console.error('[PaymentService] Error in addPaymentMethod:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to add payment method',
          code: error.code || 'ADD_PAYMENT_ERROR'
        }
      };
    }
  },

  /**
   * Get all payment methods for a user
   * @param {string} userId - User ID
   * @returns {Array} Array of payment methods
   */
  async getUserPaymentMethods(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[PaymentService] Fetching payment methods for user:', userId);

      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('is_default', { ascending: false });

      if (error) {
        console.error('[PaymentService] Error fetching payment methods:', error);
        throw error;
      }

      return { data: data || [], error: null };

    } catch (error) {
      console.error('[PaymentService] Error in getUserPaymentMethods:', error);
      return {
        data: [],
        error: {
          message: error.message || 'Failed to fetch payment methods',
          code: error.code || 'GET_PAYMENTS_ERROR'
        }
      };
    }
  },

  /**
   * Set a payment method as default
   * @param {string} userId - User ID
   * @param {string} paymentMethodId - Payment method ID to set as default
   * @returns {Object} Updated payment method
   */
  async setDefaultPaymentMethod(userId, paymentMethodId) {
    try {
      if (!userId || !paymentMethodId) {
        throw new Error('User ID and payment method ID are required');
      }

      console.log('[PaymentService] Setting default payment method:', paymentMethodId);

      // Start a transaction to update all payment methods
      const { data, error } = await supabase.rpc('set_default_payment_method', {
        p_user_id: userId,
        p_payment_method_id: paymentMethodId
      });

      if (error) {
        console.error('[PaymentService] Error setting default payment method:', error);
        throw error;
      }

      return { data, error: null };

    } catch (error) {
      console.error('[PaymentService] Error in setDefaultPaymentMethod:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to set default payment method',
          code: error.code || 'SET_DEFAULT_ERROR'
        }
      };
    }
  },

  /**
   * Remove a payment method
   * @param {string} userId - User ID
   * @param {string} paymentMethodId - Payment method ID to remove
   * @returns {Object} Result of the operation
   */
  async removePaymentMethod(userId, paymentMethodId) {
    try {
      if (!userId || !paymentMethodId) {
        throw new Error('User ID and payment method ID are required');
      }

      console.log('[PaymentService] Removing payment method:', paymentMethodId);

      // Check if this is the only payment method
      const { data: existingMethods } = await supabase
        .from('payment_methods')
        .select('id, is_default')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (existingMethods.length === 1 && existingMethods[0].id === paymentMethodId) {
        throw new Error('Cannot remove the only payment method');
      }

      // Soft delete by updating status
      const { data, error } = await supabase
        .from('payment_methods')
        .update({ 
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentMethodId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('[PaymentService] Error removing payment method:', error);
        throw error;
      }

      // If this was the default method, set another one as default
      if (data.is_default) {
        const { data: newDefault } = await supabase
          .from('payment_methods')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1)
          .single();

        if (newDefault) {
          await this.setDefaultPaymentMethod(userId, newDefault.id);
        }
      }

      return { data, error: null };

    } catch (error) {
      console.error('[PaymentService] Error in removePaymentMethod:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to remove payment method',
          code: error.code || 'REMOVE_PAYMENT_ERROR'
        }
      };
    }
  }
};

export default paymentService;
