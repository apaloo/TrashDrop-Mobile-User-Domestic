/**
 * Application configuration file
 * Pulls configuration from environment variables
 */

// Validate environment variables on import
const validateEnvVars = () => {
  const requiredVars = [
    'REACT_APP_SUPABASE_URL',
    'REACT_APP_SUPABASE_ANON_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}`;
    console.error(errorMessage);
    if (process.env.NODE_ENV === 'development') {
      alert(`Configuration Error: ${errorMessage}. Please check your .env.development file.`);
    }
    throw new Error(errorMessage);
  }

  // Validate URL format
  try {
    new URL(process.env.REACT_APP_SUPABASE_URL);
  } catch (e) {
    const errorMessage = 'Invalid SUPABASE_URL format in environment variables';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Validate API key format (basic validation for JWT)
  if (!process.env.REACT_APP_SUPABASE_ANON_KEY.startsWith('eyJ')) {
    const errorMessage = 'Invalid SUPABASE_ANON_KEY format in environment variables';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};

// Debug log environment variables
console.log('[Config] Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  REACT_APP_API_URL: process.env.REACT_APP_API_URL ? '✓ Set' : '✗ Missing',
  REACT_APP_SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL ? '✓ Set' : '✗ Missing',
  REACT_APP_SUPABASE_ANON_KEY: process.env.REACT_APP_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing',
  REACT_APP_ENABLE_MOCKS: process.env.REACT_APP_ENABLE_MOCKS
});

// Run validation
validateEnvVars();

const appConfig = {
  api: {
    baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:3001',
    timeout: 30000, // 30 seconds
  },
  supabase: {
    url: process.env.REACT_APP_SUPABASE_URL,
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
    // Log env variable status without exposing actual values
    validateConfig: () => {
      if (!process.env.REACT_APP_SUPABASE_URL) {
        console.error('REACT_APP_SUPABASE_URL is missing');
      } else {
        console.log('REACT_APP_SUPABASE_URL is set');
      }
      
      if (!process.env.REACT_APP_SUPABASE_ANON_KEY) {
        console.error('REACT_APP_SUPABASE_ANON_KEY is missing');
      } else {
        console.log('REACT_APP_SUPABASE_ANON_KEY is set');
      }
    },
  },
  maps: {
    defaultCenter: {
      lat: parseFloat(process.env.REACT_APP_MAP_CENTER_LAT) || 5.633583611574446,
      lng: parseFloat(process.env.REACT_APP_MAP_CENTER_LNG) || -0.17320421503543074,
    },
    defaultZoom: parseInt(process.env.REACT_APP_MAP_DEFAULT_ZOOM) || 13,
    googleApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
  },
  features: {
    enableMocks: false, // Always use real data - no mocks
    offlineMode: true, // Enable offline capabilities
  },
  pwa: {
    appName: 'TrashDrop',
    themeColor: '#0073e6',
    backgroundColor: '#ffffff',
  },
  storage: {
    tokenKey: 'trashdrop_auth_token',
    userKey: 'trashdrop_user',
    themeKey: 'trashdrop_theme',
  },
};

export default appConfig;
