/**
 * Geolocation service that provides robust location handling
 * Handles browser geolocation API errors and provides fallbacks
 * Uses Google Maps Geolocation API as backup when browser geolocation fails
 */

import appConfig from './app-config.js';

class GeolocationService {
  /**
   * NO DEFAULT LOCATION - Always require actual GPS data
   * geolocation failures will return null coordinates
   */
  static DEFAULT_LOCATION = null;

  /**
   * Get current user location with improved error handling and fallbacks
   * @param {Object} options - Geolocation options
   * @param {boolean} options.enableHighAccuracy - Whether to enable high accuracy (uses more battery)
   * @param {number} options.timeout - Timeout in milliseconds
   * @param {number} options.maximumAge - Max age of cached position in milliseconds
   * @param {boolean} options.silentFallback - Whether to silently use default location on error
   * @returns {Promise<Object>} Location data with success/error information
   */
  static async getCurrentPosition(options = {}) {
    // Track attempts for retrying with progressive timeouts and options
    const attemptOptions = [
      // First attempt: Quick attempt with cached position (reduced timeout for better UX)
      {
        enableHighAccuracy: false,
        timeout: 5000, // Reduced from 10s to 5s for better user experience
        maximumAge: 1200000, // 20 minutes - much longer to use cached positions
      },
      // Second attempt: Standard timeout
      {
        enableHighAccuracy: false,
        timeout: 10000, // Reduced from 25s to 10s
        maximumAge: 600000, // 10 minutes
      },
      // Third attempt: Medium timeout with high accuracy
      {
        enableHighAccuracy: true,
        timeout: 15000, // Reduced from 40s to 15s
        maximumAge: 300000, // 5 minutes
      },
      // Last attempt: Longer timeout with any accuracy
      {
        enableHighAccuracy: false,
        timeout: 20000, // Reduced from 60s to 20s for better user experience
        maximumAge: 3600000, // Accept positions up to an hour old
      }
    ];
    
    // Override with user options if specified
    if (options.timeout || options.enableHighAccuracy !== undefined || options.maximumAge) {
      // Only override the first attempt but keep the fallback attempts
      attemptOptions[0] = {
        enableHighAccuracy: options.enableHighAccuracy !== undefined ? options.enableHighAccuracy : false,
        timeout: options.timeout || 15000,
        maximumAge: options.maximumAge || 600000,
      };
    }

    // If geolocation is not supported, return error
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return {
        coords: { latitude: null, longitude: null },
        timestamp: Date.now(),
        source: 'error',
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'Geolocation not supported by browser. Please use a modern browser or manually set your location.' }
      };
    }

    // Try multiple approaches in sequence
    let lastError = null;

    // First try the browser's geolocation API with different options
    for (let i = 0; i < attemptOptions.length; i++) {
      try {
        console.log(`Geolocation attempt ${i+1} with options:`, attemptOptions[i]);
        const position = await this._getPositionPromise(attemptOptions[i]);
        
        // If we got here, geolocation succeeded
        return {
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          },
          timestamp: position.timestamp,
          source: 'browser',
          success: true
        };
      } catch (error) {
        console.warn(`Geolocation attempt ${i+1} failed:`, error);
        lastError = error;
        // Continue to next attempt
      }
    }
    
    // If we reach here, all browser geolocation attempts failed
    console.warn('All browser geolocation attempts failed. Trying Google Maps API as backup.');
    
    // Try Google Maps Geolocation API as backup if API key is available
    if (appConfig.maps.googleApiKey) {
      try {
        const googleLocation = await this._getGoogleMapsLocation();
        if (googleLocation && googleLocation.success) {
          console.log('Successfully obtained location from Google Maps API');
          return googleLocation;
        }
      } catch (googleError) {
        console.warn('Google Maps Geolocation API failed:', googleError);
        lastError = googleError;
      }
    } else {
      console.warn('No Google Maps API key available for backup geolocation');
    }
    
    // If we reach here, all attempts including Google Maps API failed
    console.error('All geolocation attempts failed. No default location available.');
    
    // If options.silentFallback is false, we'll log specific error info
    if (!options.silentFallback) {
      console.error('Geolocation error:', lastError);
    }
    
    // Return null coordinates when all geolocation methods fail
    return {
      coords: { latitude: null, longitude: null },
      timestamp: Date.now(),
      source: 'error',
      success: false,
      error: {
        code: lastError?.code || 'UNKNOWN_ERROR',
        message: this._getErrorMessage(lastError)
      }
    };
  }

  /**
   * Helper method to get a meaningful error message from geolocation errors
   * @param {Error|Object} error - Error from geolocation API
   * @returns {string} User-friendly error message
   */
  static _getErrorMessage(error) {
    // Handle standard geolocation API errors
    if (error.code) {
      switch(error.code) {
        case 1: // PERMISSION_DENIED
          return '📍 Location permission denied. We\'re using an approximate location. You can adjust the position by tapping directly on the map.';
        case 2: // POSITION_UNAVAILABLE
          return '📡 GPS signal unavailable. We\'re using an approximate location. You can adjust the position by tapping directly on the map.';
        case 3: // TIMEOUT
          return '⏱️ Location request timed out. We\'re using an approximate location. You can adjust the position by tapping directly on the map.';
        default:
          return error.message || 'Location error. Please tap on the map to set your position.';
      }
    }
    
    // Handle Google location provider specific errors that bubble up
    if (error.message && (error.message.includes('Google') || error.message.includes('googleapis.com'))) {
      console.warn('Google location service error:', error.message);
      return '🗺️ Location service temporarily unavailable. You can tap on the map to set your exact position.';
    }
    
    // Handle network-related errors
    if (error.message && (error.message.includes('network') || error.message.includes('offline'))) {
      return '📶 Network issue detecting location. You can tap on the map to set your position.';
    }
    
    return error.message || '📍 Using approximate location. You can tap on the map to set your exact position.';
  }

  /**
   * Promise wrapper for the callback-based geolocation API
   * @param {Object} options - Geolocation options
   * @returns {Promise<Position>} Geolocation Position object
   */
  static _getPositionPromise(options) {
    return new Promise((resolve, reject) => {
      try {
        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            // Successfully got position, clear watch and resolve
            navigator.geolocation.clearWatch(watchId);
            resolve(position);
          },
          (error) => {
            // Error getting position, clear watch and reject
            navigator.geolocation.clearWatch(watchId);
            reject(error);
          },
          options
        );
        
        // Fallback timeout in case watchPosition doesn't trigger either callback
        const safetyTimeout = setTimeout(() => {
          navigator.geolocation.clearWatch(watchId);
          reject(new Error('Geolocation timed out (safety timeout)'));
        }, options.timeout + 1000); // Add 1 second to the timeout
        
      } catch (err) {
        // Something went wrong even setting up geolocation
        reject(err);
      }
    });
  }

  /**
   * Validate coordinates to ensure they're usable
   * @param {Object} coords - Coordinates object with latitude and longitude
   * @returns {boolean} True if coordinates are valid
   */
  static validateCoordinates(coords) {
    if (!coords) return false;
    
    const { latitude, longitude } = coords;
    
    // Check if latitude and longitude are numbers
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
    
    // Check latitude range (-90 to 90)
    if (latitude < -90 || latitude > 90) return false;
    
    // Check longitude range (-180 to 180)
    if (longitude < -180 || longitude > 180) return false;
    
    return true;
  }
  
  /**
   * Get location using Google Maps Geolocation API as a backup method
   * Uses the device's WiFi signals, IP address, and cell tower data
   * @returns {Promise<Object>} Location data with success/error information
   */
  static async _getGoogleMapsLocation() {
    // Ensure we have an API key
    if (!appConfig.maps.googleApiKey) {
      throw new Error('Google Maps API key is not configured');
    }
    
    try {
      // Get IP-based location using Google Maps Geolocation API
      const endpoint = `https://www.googleapis.com/geolocation/v1/geolocate?key=${appConfig.maps.googleApiKey}`;
      
      // Request WiFi-based location (this works even without WiFi as it will fall back to IP)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Geolocation API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const data = await response.json();
      
      // Google's API returns: { location: { lat, lng }, accuracy }
      if (data && data.location) {
        return {
          coords: {
            latitude: data.location.lat,
            longitude: data.location.lng,
            accuracy: data.accuracy || 1000 // Default accuracy of 1000m if not provided
          },
          timestamp: Date.now(),
          source: 'google_maps_api',
          success: true
        };
      } else {
        throw new Error('Invalid response from Google Maps Geolocation API');
      }
    } catch (error) {
      console.error('Google Maps Geolocation API error:', error);
      return {
        coords: { latitude: null, longitude: null },
        timestamp: Date.now(),
        source: 'error',
        success: false,
        error: {
          code: 'GOOGLE_API_ERROR',
          message: this._getErrorMessage(error)
        }
      };
    }
  }
}

export default GeolocationService;
