/**
 * Progressive Location Enhancement Service
 * Implements tiered location capture with confidence levels
 */

import GeolocationService from '../utils/geolocationService.js';

/**
 * Location confidence tiers
 */
export const LOCATION_TIERS = {
  precise: {
    name: 'precise',
    accuracy: 5, // meters
    confidence: 'high',
    display: 'Precise Location',
    color: '#22C55E',
    icon: '📍',
    warning: null,
    allowManualAdjustment: false
  },
  good: {
    name: 'good',
    accuracy: 20, // meters
    confidence: 'medium',
    display: 'Good Location',
    color: '#3B82F6',
    icon: '📍',
    warning: 'Location accuracy is approximate',
    allowManualAdjustment: false
  },
  approximate: {
    name: 'approximate',
    accuracy: 100, // meters
    confidence: 'low',
    display: 'Approximate Area',
    color: '#F59E0B',
    icon: '📍',
    warning: 'Please adjust pin for exact location',
    allowManualAdjustment: true
  },
  manual: {
    name: 'manual',
    accuracy: null,
    confidence: 'user_defined',
    display: 'Manual Location',
    color: '#6B7280',
    icon: '📍',
    warning: 'Please place pin on map for location',
    allowManualAdjustment: true
  }
};

/**
 * Progressive Location Service
 */
export const locationService = {
  /**
   * Capture location with progressive enhancement
   * @param {Object} options - Location capture options
   * @returns {Promise<Object>} Location result with tier and confidence
   */
  async captureLocation(options = {}) {
    const {
      enableHighAccuracy = true,
      timeout = 10000,
      maximumAge = 30000,
      fallbackToNetwork = true,
      allowManual = true
    } = options;

    console.log('[LocationService] Starting progressive location capture');

    // Tier 1: High-precision GPS
    if (enableHighAccuracy) {
      try {
        console.log('[LocationService] Attempting high-precision GPS');
        const precise = await this.getGPSLocation({
          enableHighAccuracy: true,
          timeout: Math.min(timeout, 10000),
          maximumAge: 0
        });

        if (precise.accuracy <= LOCATION_TIERS.precise.accuracy) {
          console.log('[LocationService] ✅ Precise GPS location captured');
          return {
            ...precise,
            tier: LOCATION_TIERS.precise,
            method: 'gps_high_precision',
            timestamp: new Date().toISOString()
          };
        }

        console.log('[LocationService] GPS accuracy not sufficient:', precise.accuracy, 'm');
      } catch (error) {
        console.log('[LocationService] High-precision GPS failed:', error.message);
      }
    }

    // Tier 2: Standard GPS
    try {
      console.log('[LocationService] Attempting standard GPS');
      const good = await this.getGPSLocation({
        enableHighAccuracy: false,
        timeout: Math.min(timeout, 5000),
        maximumAge: maximumAge
      });

      if (good.accuracy <= LOCATION_TIERS.good.accuracy) {
        console.log('[LocationService] ✅ Good GPS location captured');
        return {
          ...good,
          tier: LOCATION_TIERS.good,
          method: 'gps_standard',
          timestamp: new Date().toISOString()
        };
      }

      console.log('[LocationService] Standard GPS accuracy not sufficient:', good.accuracy, 'm');
    } catch (error) {
      console.log('[LocationService] Standard GPS failed:', error.message);
    }

    // Tier 3: Network/Approximate location
    if (fallbackToNetwork) {
      try {
        console.log('[LocationService] Attempting network location');
        const approximate = await this.getNetworkLocation({
          timeout: Math.min(timeout, 3000)
        });

        if (approximate.accuracy <= LOCATION_TIERS.approximate.accuracy) {
          console.log('[LocationService] ✅ Approximate location captured');
          return {
            ...approximate,
            tier: LOCATION_TIERS.approximate,
            method: 'network',
            timestamp: new Date().toISOString()
          };
        }

        console.log('[LocationService] Network location accuracy not sufficient:', approximate.accuracy, 'm');
      } catch (error) {
        console.log('[LocationService] Network location failed:', error.message);
      }
    }

    // Tier 4: Manual location only
    if (allowManual) {
      console.log('[LocationService] Falling back to manual location');
      return {
        latitude: null,
        longitude: null,
        accuracy: null,
        tier: LOCATION_TIERS.manual,
        method: 'manual',
        timestamp: new Date().toISOString(),
        requiresManualInput: true
      };
    }

    // No location capture possible
    throw new Error('Unable to capture location. Please enable location services and try again.');
  },

  /**
   * Get GPS location using browser geolocation API
   * @param {Object} options - Geolocation options
   * @returns {Promise<Object>} Location coordinates
   */
  async getGPSLocation(options = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      const defaultOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      };

      const finalOptions = { ...defaultOptions, ...options };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp
          });
        },
        (error) => {
          let errorMessage = 'Unknown geolocation error';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied. Please enable location services.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out.';
              break;
          }
          reject(new Error(errorMessage));
        },
        finalOptions
      );
    });
  },

  /**
   * Get network-based location (IP geolocation fallback)
   * @param {Object} options - Network location options
   * @returns {Promise<Object>} Approximate location
   */
  async getNetworkLocation(options = {}) {
    const { timeout = 5000 } = options;

    // Try browser's geolocation without high accuracy first
    try {
      return await this.getGPSLocation({
        enableHighAccuracy: false,
        timeout,
        maximumAge: 300000 // 5 minutes
      });
    } catch (error) {
      // Fallback to IP-based geolocation
      console.log('[LocationService] GPS failed, trying IP geolocation');
      return await this.getIPLocation();
    }
  },

  /**
   * Get IP-based location as last resort
   * @returns {Promise<Object>} IP-based location
   */
  async getIPLocation() {
    try {
      // Using a free IP geolocation service
      const response = await fetch('https://ipapi.co/json/', {
        timeout: 5000
      });
      
      if (!response.ok) {
        throw new Error('IP geolocation service unavailable');
      }

      const data = await response.json();
      
      if (!data.latitude || !data.longitude) {
        throw new Error('IP geolocation returned invalid coordinates');
      }

      return {
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        accuracy: 1000, // IP geolocation is very approximate
        city: data.city,
        region: data.region,
        country: data.country,
        method: 'ip_geolocation'
      };
    } catch (error) {
      throw new Error(`IP geolocation failed: ${error.message}`);
    }
  },

  /**
   * Validate location coordinates
   * @param {number} latitude - Latitude coordinate
   * @param {number} longitude - Longitude coordinate
   * @param {Object} bounds - Geographic bounds for validation
   * @returns {boolean} Whether coordinates are valid
   */
  validateCoordinates(latitude, longitude, bounds = null) {
    // Basic coordinate validation
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return false;
    }

    if (isNaN(latitude) || isNaN(longitude)) {
      return false;
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return false;
    }

    // Geographic bounds validation (default to Ghana bounds)
    const defaultBounds = {
      minLat: 4.0,
      maxLat: 12.0,
      minLng: -4.0,
      maxLng: 2.0
    };

    const validationBounds = bounds || defaultBounds;

    return latitude >= validationBounds.minLat && 
           latitude <= validationBounds.maxLat && 
           longitude >= validationBounds.minLng && 
           longitude <= validationBounds.maxLng;
  },

  /**
   * Calculate distance between two points
   * @param {number} lat1 - First point latitude
   * @param {number} lng1 - First point longitude
   * @param {number} lat2 - Second point latitude
   * @param {number} lng2 - Second point longitude
   * @returns {number} Distance in meters
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  },

  /**
   * Get location tier configuration
   * @param {string} tierName - Tier name
   * @returns {Object} Tier configuration
   */
  getTierConfig(tierName) {
    return LOCATION_TIERS[tierName] || LOCATION_TIERS.manual;
  },

  /**
   * Format location for display
   * @param {Object} location - Location object
   * @returns {Object} Formatted location for UI
   */
  formatLocationForDisplay(location) {
    const tier = this.getTierConfig(location.tier?.name || 'manual');
    
    return {
      ...location,
      display: tier.display,
      confidence: tier.confidence,
      color: tier.color,
      icon: tier.icon,
      warning: tier.warning,
      allowManualAdjustment: tier.allowManualAdjustment,
      formattedAccuracy: location.accuracy ? 
        `±${Math.round(location.accuracy)}m` : 
        'Manual',
      isValid: this.validateCoordinates(location.latitude, location.longitude)
    };
  },

  /**
   * Create location with manual adjustment
   * @param {number} latitude - Manual latitude
   * @param {number} longitude - Manual longitude
   * @returns {Object} Manual location object
   */
  createManualLocation(latitude, longitude) {
    if (!this.validateCoordinates(latitude, longitude)) {
      throw new Error('Invalid manual coordinates');
    }

    return {
      latitude,
      longitude,
      accuracy: null,
      tier: LOCATION_TIERS.manual,
      method: 'manual',
      timestamp: new Date().toISOString(),
      requiresManualInput: false
    };
  }
};

export default locationService;
