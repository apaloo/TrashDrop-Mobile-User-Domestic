import React, { useState, useEffect } from 'react';

/**
 * Network Monitor for Supabase API Requests
 * 
 * This utility helps monitor and log all network requests to Supabase,
 * which is useful for debugging authentication and API issues.
 */

class NetworkMonitor {
  constructor() {
    this.requests = [];
    this.maxRequests = 50; // Maximum number of requests to keep in memory
    this.isMonitoring = false;
    this.originalFetch = null;
  }

  /**
   * Start monitoring network requests
   */
  start() {
    if (this.isMonitoring) return;
    
    // Store the original fetch
    this.originalFetch = window.fetch;
    
    // Override the global fetch
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const isSupabaseRequest = url && (
        url.includes(process.env.REACT_APP_SUPABASE_URL) ||
        url.includes('supabase.co/rest/v1/')
      );
      
      const requestId = Date.now();
      const startTime = performance.now();
      
      // Create request log entry
      const requestLog = {
        id: requestId,
        url,
        method: (init.method || 'GET').toUpperCase(),
        headers: { ...(init.headers || {}) },
        timestamp: new Date().toISOString(),
        status: 'pending',
        duration: null,
        response: null,
        error: null,
        isSupabaseRequest,
        init: init ? { ...init } : null
      };
      
      // Don't log request body if it's a FormData or Blob
      if (init.body && !(init.body instanceof FormData) && !(init.body instanceof Blob)) {
        try {
          requestLog.body = JSON.parse(init.body);
        } catch (e) {
          requestLog.body = init.body;
        }
      }
      
      // Add to requests array
      this.requests.unshift(requestLog);
      
      // Keep only the most recent requests
      if (this.requests.length > this.maxRequests) {
        this.requests.length = this.maxRequests;
      }
      
      try {
        // Make the actual request
        const response = await this.originalFetch.call(window, input, init);
        const endTime = performance.now();
        
        // Clone the response so we can read it multiple times
        const responseClone = response.clone();
        
        // Update request log with response
        requestLog.status = 'completed';
        requestLog.duration = Math.round(endTime - startTime);
        requestLog.response = {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: null
        };
        
        // Try to parse response as JSON, fall back to text if it fails
        try {
          const data = await responseClone.json();
          requestLog.response.body = data;
        } catch (e) {
          try {
            const text = await responseClone.text();
            requestLog.response.body = text;
          } catch (e) {
            requestLog.response.body = '[Binary data]';
          }
        }
        
        return response;
      } catch (error) {
        const endTime = performance.now();
        
        // Update request log with error
        requestLog.status = 'error';
        requestLog.duration = Math.round(endTime - startTime);
        requestLog.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        throw error;
      }
    };
    
    this.isMonitoring = true;
    console.log('[NetworkMonitor] Started monitoring network requests');
  }
  
  /**
   * Stop monitoring network requests
   */
  stop() {
    if (!this.isMonitoring) return;
    
    // Restore original fetch
    window.fetch = this.originalFetch;
    this.originalFetch = null;
    this.isMonitoring = false;
    
    console.log('[NetworkMonitor] Stopped monitoring network requests');
  }
  
  /**
   * Get all captured requests
   * @param {Object} options - Filter options
   * @param {boolean} options.supabaseOnly - Only return Supabase requests
   * @param {string} options.method - Filter by HTTP method
   * @param {number} options.limit - Maximum number of requests to return
   * @returns {Array} Array of request logs
   */
  getRequests({ supabaseOnly = true, method = null, limit = null } = {}) {
    let requests = [...this.requests];
    
    if (supabaseOnly) {
      requests = requests.filter(req => req.isSupabaseRequest);
    }
    
    if (method) {
      const methodUpper = method.toUpperCase();
      requests = requests.filter(req => req.method === methodUpper);
    }
    
    if (limit) {
      requests = requests.slice(0, limit);
    }
    
    return requests;
  }
  
  /**
   * Clear all captured requests
   */
  clear() {
    this.requests = [];
    console.log('[NetworkMonitor] Cleared all captured requests');
  }
  
  /**
   * Log requests to console in a readable format
   * @param {Object} options - Filter options (same as getRequests)
   */
  logRequests(options = {}) {
    const requests = this.getRequests(options);
    
    if (requests.length === 0) {
      console.log('[NetworkMonitor] No requests found matching the criteria');
      return;
    }
    
    console.group(`[NetworkMonitor] ${requests.length} requests:`);
    
    requests.forEach((req, index) => {
      const statusColor = req.status === 'completed' 
        ? (req.response.status >= 400 ? 'color: #f44336' : 'color: #4caf50')
        : 'color: #ff9800';
      
      console.groupCollapsed(
        `%c${req.method} ${req.url} %c${req.status}%c`,
        'font-weight: bold;',
        `font-weight: bold; ${statusColor}`,
        ''
      );
      
      console.log('Method:', req.method);
      console.log('URL:', req.url);
      console.log('Status:', req.status);
      
      if (req.duration !== null) {
        console.log('Duration:', `${req.duration}ms`);
      }
      
      if (Object.keys(req.headers).length > 0) {
        console.group('Headers:');
        Object.entries(req.headers).forEach(([key, value]) => {
          console.log(`${key}:`, value);
        });
        console.groupEnd();
      }
      
      if (req.body) {
        console.log('Request Body:', req.body);
      }
      
      if (req.response) {
        console.group('Response:');
        console.log('Status:', `${req.response.status} ${req.response.statusText}`);
        
        if (req.response.headers && Object.keys(req.response.headers).length > 0) {
          console.group('Headers:');
          Object.entries(req.response.headers).forEach(([key, value]) => {
            console.log(`${key}:`, value);
          });
          console.groupEnd();
        }
        
        if (req.response.body !== null) {
          console.log('Body:', req.response.body);
        }
        
        console.groupEnd();
      }
      
      if (req.error) {
        console.group('Error:');
        console.error(req.error);
        console.groupEnd();
      }
      
      console.groupEnd();
    });
    
    console.groupEnd();
  }
}

// Export a singleton instance
const networkMonitor = new NetworkMonitor();

// Custom hook to monitor online/offline status
const useNetwork = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
};

export { useNetwork };
export default networkMonitor;
