/**
 * Toast notification service for managing non-blocking notifications
 * Provides a global API for showing toast notifications from anywhere in the app
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import ToastNotification from '../components/ToastNotification';

class ToastService {
  constructor() {
    this.container = null;
    this.root = null;
    this.toasts = [];
    this.nextId = 1;
    this.config = {
      position: 'top-right',
      maxToasts: 5
    };
    // Wait for DOM to be ready before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  /**
   * Initialize the toast container in the DOM
   * @param {HTMLElement} [container] - Optional container element (provided by ToastProvider)
   * @param {Object} [config] - Configuration options
   * @param {string} [config.position] - Toast position
   * @param {number} [config.maxToasts] - Maximum number of toasts to show at once
   */
  initialize(container = null, config = {}) {
    // Update config if provided
    if (config.position) this.config.position = config.position;
    if (config.maxToasts) this.config.maxToasts = config.maxToasts;
    
    // Check if we already have a root/container to prevent React 18 warnings
    if (this.root) {
      // If we already have a root but a new container is provided, do nothing
      // as React 18 doesn't support changing containers for existing roots
      if (container && this.container !== container) {
        console.warn('Toast container already exists. Cannot change containers for an existing React root.');
      }
      // If config changed, we can still update that
      return this.container;
    }
    
    // Use provided container if explicitly passed in
    if (container) {
      this.container = container;
      console.log('[ToastService] Using provided container', container.id || 'unnamed');
    } else {
      // Look for existing toast container
      const existingContainer = document.getElementById('toast-container');
      if (existingContainer) {
        console.log('[ToastService] Found existing toast container');
        this.container = existingContainer;
      }
    }
    
    // Create container if not found or provided
    if (!this.container) {
      console.debug('[Toast] Initializing default toast container...');
      
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = `toast-container toast-position-${this.config.position}`;
      
      // Apply positioning styles
      this.container.style.position = 'fixed';
      this.container.style.zIndex = '9999';
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.alignItems = this.config.position.includes('left') ? 'flex-start' : 'flex-end';
      this.container.style.pointerEvents = 'none'; // Let clicks pass through container
      this.container.style.maxWidth = '90%';
      this.container.style.maxHeight = '90vh';
      this.container.style.overflow = 'hidden';

      // Position based on config
      if (this.config.position.includes('top')) this.container.style.top = '20px';
      if (this.config.position.includes('bottom')) this.container.style.bottom = '20px';
      if (this.config.position.includes('left')) this.container.style.left = '20px';
      if (this.config.position.includes('right')) this.container.style.right = '20px';
      if (this.config.position.includes('center')) {
        this.container.style.left = '50%';
        this.container.style.transform = 'translateX(-50%)';
      }

      // Add to document if possible
      if (document.body) {
        document.body.appendChild(this.container);
        console.log('[ToastService] Created new toast container', this.container.id);
      }
    }
      
    // Create root once container is in the DOM and if we don't already have a root
    if (this.container && !this.root) {
      this.root = createRoot(this.container);
      console.log('[ToastService] Created React root for toast container');
    }
    
    // Initialize with any existing toasts
    if (this.toasts.length > 0) {
      this.render();
    }
    
    return this.container;
  }

  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {Object} options - Toast options
   * @param {string} [options.type='info'] - Toast type (info, success, warning, error)
   * @param {number} [options.duration=4000] - Display duration in ms, set to 0 for persistent toast
   * @param {string} [options.position] - Override default position for this toast only
   * @returns {number} Toast ID for reference
   */
  show(message, options = {}) {
    const id = this.nextId++;
    const toast = {
      id,
      message,
      type: options.type || 'info',
      duration: options.duration !== undefined ? options.duration : 4000,
      position: options.position || this.config.position,
      createdAt: Date.now()
    };

    // Enforce maximum toast limit - remove oldest first
    if (this.toasts.length >= this.config.maxToasts) {
      // Find oldest non-persistent toast
      const oldestIndex = this.toasts
        .map((t, i) => ({ index: i, toast: t }))
        .filter(item => item.toast.duration > 0) // Filter out persistent toasts
        .sort((a, b) => a.toast.createdAt - b.toast.createdAt)[0];
        
      if (oldestIndex) {
        this.toasts.splice(oldestIndex.index, 1);
      }
    }

    this.toasts.push(toast);
    this.render();

    // Auto-dismiss if duration is set
    if (toast.duration > 0) {
      setTimeout(() => this.dismiss(id), toast.duration);
    }

    return id;
  }

  /**
   * Show an info toast
   * @param {string} message - Message to display
   * @param {Object} options - Toast options
   * @returns {number} Toast ID
   */
  info(message, options = {}) {
    return this.show(message, { ...options, type: 'info' });
  }

  /**
   * Show a success toast
   * @param {string} message - Message to display
   * @param {Object} options - Toast options
   * @returns {number} Toast ID
   */
  success(message, options = {}) {
    return this.show(message, { ...options, type: 'success' });
  }

  /**
   * Show a warning toast
   * @param {string} message - Message to display
   * @param {Object} options - Toast options
   * @returns {number} Toast ID
   */
  warning(message, options = {}) {
    return this.show(message, { ...options, type: 'warning' });
  }

  /**
   * Show an error toast
   * @param {string} message - Message to display
   * @param {Object} options - Toast options
   * @returns {number} Toast ID
   */
  error(message, options = {}) {
    return this.show(message, { ...options, type: 'error' });
  }

  /**
   * Dismiss a toast by ID
   * @param {number} id - Toast ID to dismiss
   */
  dismiss(id) {
    const index = this.toasts.findIndex(t => t.id === id);
    if (index !== -1) {
      this.toasts.splice(index, 1);
      this.render();
    }
  }

  /**
   * Clear all toasts
   */
  clear() {
    this.toasts = [];
    this.render();
  }

  /**
   * Render all active toasts
   */
  render() {
    if (!this.container) {
      this.initialize();
    }

    // Sort toasts by position to group them correctly
    const toastsByPosition = {};
    
    // Group toasts by their position
    this.toasts.forEach(toast => {
      const position = toast.position || this.config.position;
      if (!toastsByPosition[position]) {
        toastsByPosition[position] = [];
      }
      toastsByPosition[position].push(toast);
    });
    
    // For now, we only render in the default position
    // In the future, we could create multiple containers for different positions
    
    if (this.root) {
      this.root.render(
        <>
          {this.toasts.map(toast => (
            <ToastNotification
              key={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              persistent={toast.duration === 0}
              onDismiss={() => this.dismiss(toast.id)}
            />
          ))}
        </>
      );
    } else if (this.container && !this.root) {
      // Create root if it doesn't exist but container does
      this.root = createRoot(this.container);
      this.render(); // Re-render once root is created
    }
  }
}

// Export singleton instance
export const toastService = new ToastService();
export default toastService;
