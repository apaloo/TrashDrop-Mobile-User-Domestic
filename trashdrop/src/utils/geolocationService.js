/**
 * Geolocation service that provides robust location handling
 * Handles browser geolocation API errors and provides fallbacks
 * Uses Google Maps Geolocation API as backup when browser geolocation fails
 */

import appConfig from './app-config.js';

class GeolocationService {
  /**
   * NO DEFAULT LOCATION - Always require actual GPS data
   * Geolocation failures will return null coordinates
   * Collectors need precise locations (≤5m accuracy)
   */
  static DEFAULT_LOCATION = null;
  
  /**
   * Required GPS accuracy in meters
   * Positions with accuracy > this value will be rejected
   */
  static REQUIRED_ACCURACY_METERS = 5;

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
    // STRICT GPS SETTINGS for ≤5m accuracy - NO CACHING
    // Collectors need precise locations, so we enforce high accuracy
    const attemptOptions = [
      // First attempt: High accuracy, no cache
      {
        enableHighAccuracy: true,
        timeout: 15000, // 15 seconds for GPS lock
        maximumAge: 0, // NO cached positions - always get fresh GPS
      },
      // Second attempt: Longer timeout for difficult conditions
      {
        enableHighAccuracy: true,
        timeout: 30000, // 30 seconds
        maximumAge: 0, // NO cached positions
      },
      // Third attempt: Even longer timeout
      {
        enableHighAccuracy: true,
        timeout: 45000, // 45 seconds
        maximumAge: 0, // NO cached positions
      }
    ];
    
    // Override timeout only - always enforce high accuracy and no cache
    if (options.timeout) {
      attemptOptions[0] = {
        enableHighAccuracy: true, // ALWAYS high accuracy
        timeout: options.timeout,
        maximumAge: 0, // NEVER use cached positions
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
        
        // Check if accuracy meets our ≤5m requirement
        const accuracy = position.coords.accuracy;
        console.log(`GPS accuracy: ${accuracy}m (required: ≤${this.REQUIRED_ACCURACY_METERS}m)`);
        
        if (accuracy > this.REQUIRED_ACCURACY_METERS) {
          console.warn(`GPS accuracy ${accuracy}m exceeds ${this.REQUIRED_ACCURACY_METERS}m requirement, retrying...`);
          lastError = { code: 'ACCURACY_TOO_LOW', message: `GPS accuracy ${accuracy.toFixed(1)}m is too low. Need ≤${this.REQUIRED_ACCURACY_METERS}m.` };
          // Continue to next attempt for better accuracy
          continue;
        }
        
        // Accuracy is acceptable
        return {
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: accuracy
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
    
    // Google Maps Geolocation API is NOT suitable for ≤5m accuracy
    // It uses cell towers/WiFi/IP which gives 100-1000m+ accuracy
    // Skip it entirely for precision requirements
    console.warn('[GPSService] All browser GPS attempts failed. Google Maps API skipped (insufficient accuracy for ≤5m requirement).');
    
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
    // Handle accuracy-specific errors
    if (error.code === 'ACCURACY_TOO_LOW') {
      return error.message;
    }
    
    // Handle standard geolocation API errors
    if (error.code) {
      switch(error.code) {
        case 1: // PERMISSION_DENIED
          return 'Location permission denied. Please enable location services in your device settings and try again.';
        case 2: // POSITION_UNAVAILABLE
          return 'GPS signal unavailable. Please move to an open area with clear sky view and try again.';
        case 3: // TIMEOUT
          return 'GPS signal too weak. Please move outdoors or to an area with better GPS reception.';
        default:
          return error.message || 'Could not get precise GPS location. Please try again in a different location.';
      }
    }
    
    // Handle network-related errors
    if (error.message && (error.message.includes('network') || error.message.includes('offline'))) {
      return 'Network issue. Please check your internet connection and try again.';
    }
    
    return error.message || 'Could not get precise GPS location. Please ensure location services are enabled and try again.';
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
