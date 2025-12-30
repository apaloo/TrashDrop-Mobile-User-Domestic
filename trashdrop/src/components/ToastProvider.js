import React, { useEffect } from 'react';
import { toastService } from '../services/toastService';
import '../styles/ToastNotification.css';

/**
 * ToastProvider component to initialize the toast container in the DOM
 * This component should be mounted once at the app root level
 * 
 * @param {Object} props Component props
 * @param {React.ReactNode} props.children Child components
 * @param {string} [props.position='top-right'] Position of toasts ('top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center')
 * @param {number} [props.maxToasts=5] Maximum number of visible toasts at once
 */
const ToastProvider = ({ 
  children, 
  position = 'top-right',
  maxToasts = 5
}) => {
  useEffect(() => {
    // Create toast container if it doesn't exist
    const containerId = 'toast-container';
    let container = document.getElementById(containerId);
    
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.className = `toast-container toast-position-${position}`;
      container.setAttribute('data-max-toasts', maxToasts);
      
      // Apply fixed positioning styles
      Object.assign(container.style, {
        position: 'fixed',
        zIndex: '9999',
        display: 'flex',
        flexDirection: 'column',
        alignItems: position.includes('left') ? 'flex-start' : 'flex-end',
        pointerEvents: 'none', // Let clicks pass through container
        maxWidth: '90%',
        maxHeight: '90vh',
        overflow: 'hidden',
      });
      
      // Positioning styles based on position prop
      switch (position) {
        case 'top-right':
          container.style.top = '20px';
          container.style.right = '20px';
          break;
        case 'top-left':
          container.style.top = '20px';
          container.style.left = '20px';
          break;
        case 'bottom-right':
          container.style.bottom = '20px';
          container.style.right = '20px';
          break;
        case 'bottom-left':
          container.style.bottom = '20px';
          container.style.left = '20px';
          break;
        case 'top-center':
          container.style.top = '20px';
          container.style.left = '50%';
          container.style.transform = 'translateX(-50%)';
          break;
        case 'bottom-center':
          container.style.bottom = '20px';
          container.style.left = '50%';
          container.style.transform = 'translateX(-50%)';
          break;
        default:
          throw new Error(`Invalid position: ${position}`);
      }
      
      document.body.appendChild(container);
      console.log('[ToastProvider] Created toast container element', containerId);
    } else {
      console.log('[ToastProvider] Found existing toast container');
    }
    
    // Initialize toast service with our container and config
    toastService.initialize(container, {
      position: position,
      maxToasts: maxToasts
    });
    console.log('[ToastProvider] Initialized toast service with container');
    
    // Clean up on unmount
    return () => {
      toastService.clear();
      // Don't remove container on unmount to avoid flickering
      // if component remounts
    };
  }, [position, maxToasts]);
  
  // This component doesn't render anything visible
  return children || null;
};

export default ToastProvider;
