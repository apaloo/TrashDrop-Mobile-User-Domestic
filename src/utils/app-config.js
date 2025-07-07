/**
 * Application configuration file
 * Pulls configuration from environment variables
 */

const appConfig = {
  api: {
    baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:3001',
    timeout: 30000, // 30 seconds
  },
  supabase: {
    url: process.env.REACT_APP_SUPABASE_URL,
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
  },
  maps: {
    defaultCenter: {
      lat: parseFloat(process.env.REACT_APP_MAP_CENTER_LAT) || 37.7749,
      lng: parseFloat(process.env.REACT_APP_MAP_CENTER_LNG) || -122.4194,
    },
    defaultZoom: parseInt(process.env.REACT_APP_MAP_DEFAULT_ZOOM) || 13,
  },
  features: {
    enableMocks: process.env.REACT_APP_ENABLE_MOCKS === 'true',
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
