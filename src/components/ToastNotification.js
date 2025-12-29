import React, { useEffect, useState } from 'react';
import '../styles/ToastNotification.css';

/**
 * ToastNotification component for displaying temporary notifications
 * 
 * @param {Object} props - Component props
 * @param {string} props.message - The notification message
 * @param {string} props.type - Type of notification (success, error, info, warning)
 * @param {number} props.duration - Duration in ms before auto-dismissal (0 = no auto-dismiss)
 * @param {boolean} props.persistent - Whether the toast should persist until manually dismissed
 * @param {Function} props.onDismiss - Callback function when toast is dismissed
 */
const ToastNotification = ({ 
  message, 
  type = 'info', 
  duration = 4000, 
  persistent = false,
  onDismiss 
}) => {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(100);
  
  // Set up auto-dismiss
  useEffect(() => {
    let dismissTimer;
    let progressInterval;
    
    // Skip auto-dismiss for persistent toasts
    if (persistent || duration === 0) {
      return;
    }
    
    // Set up progress bar updates
    const updateInterval = 10; // Update every 10ms
    const steps = duration / updateInterval;
    const decrementPerStep = 100 / steps;
    
    progressInterval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev - decrementPerStep;
        return newProgress > 0 ? newProgress : 0;
      });
    }, updateInterval);
    
    // Set up auto-dismiss timer
    dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        onDismiss && onDismiss();
      }, 300); // Wait for fade out animation
    }, duration);
    
    // Clean up timers
    return () => {
      clearTimeout(dismissTimer);
      clearInterval(progressInterval);
    };
  }, [duration, onDismiss, persistent]);
  
  // Handle dismiss button click
  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      onDismiss && onDismiss();
    }, 300); // Wait for fade out animation
  };
  
  // Determine icon based on type
  const getIcon = () => {
    switch(type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };
  
  return (
    <div 
      className={`toast-notification ${type} ${visible ? 'visible' : 'hidden'} ${persistent ? 'persistent' : ''}`}
      // Enable pointer events on the toast itself, overriding container's pointerEvents: none
      style={{ pointerEvents: 'auto' }}
      // Add accessibility attributes
      role="alert"
      aria-live="assertive"
    >
      <div className="toast-content">
        <span className="toast-icon" aria-hidden="true">{getIcon()}</span>
        <p className="toast-message">{
          persistent ? 
            <>
              <span className="persistent-indicator">📌</span> {message}
            </> : 
            message
        }</p>
        <button 
          className="toast-close" 
          onClick={handleDismiss}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
      {!persistent && duration > 0 && (
        <div 
          className="toast-progress" 
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(progress)}
        ></div>
      )}
    </div>
  );
};

export default ToastNotification;
