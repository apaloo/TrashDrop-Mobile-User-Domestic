import React, { useState, useEffect } from 'react';
import { render } from 'react-dom';

const TestPickupFlow = () => {
  const [step, setStep] = useState(0);
  const [pickupData, setPickupData] = useState(null);
  const [formData, setFormData] = useState({
    weight: '',
    notes: '',
    paymentMethod: 'card',
    rating: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Simulate QR code scan data
  const testPickupData = {
    pickupId: "pickup_1752179056372_ochwm6mgc",
    userId: "af295743-e6e1-49e0-a270-07be0f9f5055",
    timestamp: 1752179056372,
    locationId: "local_1752179056372",
    offline: false
  };

  // Simulate scanning the QR code
  const simulateQRScan = () => {
    setPickupData(testPickupData);
    setStep(1);
  };

  // Simulate form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setStep(2); // Move to payment step
    }, 1000);
  };

  // Simulate payment
  const handlePayment = async () => {
    setLoading(true);
    
    // Simulate payment processing
    setTimeout(() => {
      setLoading(false);
      setStep(3); // Move to rating step
    }, 1500);
  };

  // Simulate rating submission
  const handleRating = async () => {
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setSuccess('Pickup completed successfully!');
    }, 1000);
  };

  if (step === 0) {
    return (
      <div style={styles.container}>
        <h2>Test Pickup Flow</h2>
        <p>This is a test component to simulate the pickup flow.</p>
        <button 
          onClick={simulateQRScan}
          style={styles.button}
        >
          Simulate QR Code Scan
        </button>
      </div>
    );
  }

  if (step === 1 && pickupData) {
    return (
      <div style={styles.container}>
        <h2>Pickup Details</h2>
        <div style={styles.details}>
          <p><strong>Pickup ID:</strong> {pickupData.pickupId}</p>
          <p><strong>Location ID:</strong> {pickupData.locationId}</p>
          <p><strong>Timestamp:</strong> {new Date(pickupData.timestamp).toLocaleString()}</p>
        </div>
        
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label>Weight (kg):</label>
            <input 
              type="number" 
              value={formData.weight}
              onChange={(e) => setFormData({...formData, weight: e.target.value})}
              style={styles.input}
              required
            />
          </div>
          
          <div style={styles.formGroup}>
            <label>Notes:</label>
            <textarea 
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              style={styles.textarea}
            />
          </div>
          
          <button 
            type="submit" 
            style={styles.button}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Submit Pickup'}
          </button>
        </form>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div style={styles.container}>
        <h2>Payment</h2>
        <div style={styles.details}>
          <p><strong>Amount:</strong> $10.00</p>
          <p><strong>Payment Method:</strong> Card</p>
        </div>
        
        <div style={styles.formGroup}>
          <label>Card Number:</label>
          <input 
            type="text" 
            placeholder="4242 4242 4242 4242"
            style={styles.input}
          />
        </div>
        
        <div style={styles.formGroup}>
          <label>Expiry Date:</label>
          <input 
            type="text" 
            placeholder="MM/YY"
            style={styles.input}
          />
        </div>
        
        <div style={styles.formGroup}>
          <label>CVC:</label>
          <input 
            type="text" 
            placeholder="123"
            style={styles.input}
          />
        </div>
        
        <button 
          onClick={handlePayment}
          style={styles.button}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Pay Now'}
        </button>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div style={styles.container}>
        <h2>Rate Your Experience</h2>
        <div style={styles.ratingContainer}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setFormData({...formData, rating: star})}
              style={{
                ...styles.starButton,
                color: star <= formData.rating ? '#ffd700' : '#ccc'
              }}
            >
              ★
            </button>
          ))}
        </div>
        
        <button 
          onClick={handleRating}
          style={styles.button}
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Submit Rating'}
        </button>
        
        {success && (
          <div style={styles.success}>
            {success}
          </div>
        )}
      </div>
    );
  }

  return null;
};

const styles = {
  container: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  },
  button: {
    backgroundColor: '#4CAF50',
    color: 'white',
    padding: '10px 15px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    marginTop: '10px'
  },
  details: {
    backgroundColor: '#f5f5f5',
    padding: '15px',
    borderRadius: '4px',
    marginBottom: '20px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  },
  input: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '16px'
  },
  textarea: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    minHeight: '100px',
    fontSize: '16px'
  },
  ratingContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    margin: '20px 0'
  },
  starButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    cursor: 'pointer',
    padding: '0 5px'
  },
  success: {
    marginTop: '20px',
    padding: '10px',
    backgroundColor: '#dff0d8',
    color: '#3c763d',
    borderRadius: '4px',
    textAlign: 'center'
  }
};

// Create a container for our test component
const container = document.createElement('div');
container.id = 'test-pickup-flow';
document.body.appendChild(container);

// Render the test component
render(<TestPickupFlow />, container);

console.log('Test Pickup Flow component loaded. Click the button to start.');
