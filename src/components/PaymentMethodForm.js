import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material';
import { useAuth } from '../context/AuthContext.js';
import { paymentService } from '../services/paymentService.js';

const PaymentMethodForm = ({ onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    type: '',
    provider: '',
    cardNumber: '',
    expiryDate: '',
    cvv: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(null);
  };

  const validateForm = () => {
    if (!formData.type) {
      setError('Payment type is required');
      return false;
    }
    if (!formData.provider) {
      setError('Provider is required');
      return false;
    }
    if (formData.type === 'card') {
      if (!formData.cardNumber || !formData.expiryDate || !formData.cvv) {
        setError('All card details are required');
        return false;
      }
      // Basic card validation
      if (!/^\d{16}$/.test(formData.cardNumber.replace(/\s/g, ''))) {
        setError('Invalid card number');
        return false;
      }
      if (!/^\d{2}\/\d{2}$/.test(formData.expiryDate)) {
        setError('Invalid expiry date (MM/YY)');
        return false;
      }
      if (!/^\d{3,4}$/.test(formData.cvv)) {
        setError('Invalid CVV');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      // Format payment details based on type
      const paymentDetails = {
        type: formData.type,
        provider: formData.provider,
        details: formData.type === 'card' ? {
          last4: formData.cardNumber.slice(-4),
          expiry: formData.expiryDate,
          // In a real app, card details would be tokenized
          // and processed by a payment processor
        } : {}
      };

      const { data, error: paymentError } = await paymentService.addPaymentMethod(
        user.id,
        paymentDetails
      );

      if (paymentError) {
        throw new Error(paymentError.message);
      }

      // Clear form
      setFormData({
        type: '',
        provider: '',
        cardNumber: '',
        expiryDate: '',
        cvv: ''
      });

      // Call success callback
      if (onSuccess) {
        onSuccess(data);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 400, mx: 'auto', p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Add Payment Method
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <FormControl fullWidth margin="normal">
        <InputLabel id="payment-type-label" htmlFor="payment-type">Payment Type</InputLabel>
        <Select
          native
          labelId="payment-type-label"
          id="payment-type"
          label="Payment Type"
          name="type"
          value={formData.type}
          onChange={handleChange}
          required
        >
          <option aria-label="None" value="" />
          <option value="card">Credit/Debit Card</option>
          <option value="bank">Bank Account</option>
          <option value="mobile">Mobile Money</option>
        </Select>
      </FormControl>

      <FormControl fullWidth margin="normal">
        <InputLabel id="provider-label" htmlFor="provider">Provider</InputLabel>
        <Select
          native
          labelId="provider-label"
          id="provider"
          label="Provider"
          name="provider"
          value={formData.provider}
          onChange={handleChange}
          required
        >
          <option aria-label="None" value="" />
          {formData.type === 'card' && (
            <>
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
            </>
          )}
          {formData.type === 'bank' && (
            <>
              <option value="boa">Bank of America</option>
              <option value="chase">Chase</option>
              <option value="wells_fargo">Wells Fargo</option>
            </>
          )}
          {formData.type === 'mobile' && (
            <>
              <option value="mpesa">M-Pesa</option>
              <option value="airtel">Airtel Money</option>
            </>
          )}
        </Select>
      </FormControl>

      {formData.type === 'card' && (
        <>
          <TextField
            fullWidth
            margin="normal"
            label="Card Number"
            name="cardNumber"
            value={formData.cardNumber}
            onChange={handleChange}
            inputProps={{
              maxLength: 16,
              pattern: '\\d*'
            }}
            required
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              margin="normal"
              label="Expiry Date"
              name="expiryDate"
              value={formData.expiryDate}
              onChange={handleChange}
              placeholder="MM/YY"
              inputProps={{
                maxLength: 5
              }}
              required
              sx={{ flex: 1 }}
            />

            <TextField
              margin="normal"
              label="CVV"
              name="cvv"
              value={formData.cvv}
              onChange={handleChange}
              type="password"
              inputProps={{
                maxLength: 4,
                pattern: '\\d*'
              }}
              required
              sx={{ flex: 1 }}
            />
          </Box>
        </>
      )}

      <Button
        type="submit"
        variant="contained"
        color="primary"
        fullWidth
        disabled={loading}
        sx={{ mt: 3 }}
      >
        {loading ? <CircularProgress size={24} /> : 'Add Payment Method'}
      </Button>
    </Box>
  );
};

export default PaymentMethodForm;
