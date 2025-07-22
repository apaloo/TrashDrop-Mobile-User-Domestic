import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// Context Providers
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { NetworkProvider } from './utils/networkMonitor.js';
import { OfflineQueueProvider } from './context/OfflineQueueContext.js';

// Pages
import Login from './pages/Login.js';
import Register from './pages/Register.js';
import ResetPassword from './pages/ResetPassword.js';
import Profile from './pages/Profile.js';
import Dashboard from './pages/Dashboard.js';
import SchedulePickup from './pages/SchedulePickup.js';
import PickupRequest from './pages/PickupRequest.js';
import DumpingReport from './pages/DumpingReport.js';
import Rewards from './pages/Rewards.js';
import QRScanner from './pages/QRScanner.js';
import CollectionForm from './pages/CollectionForm.js';
import CollectionQRCode from './pages/CollectionQRCode.js';
import Activity from './pages/Activity.js';
import SchemaTest from './pages/SchemaTest.js';
import PaymentMethods from './pages/PaymentMethods.js';
import Notifications from './pages/Notifications.js';
import CollectorTracking from './pages/CollectorTracking.js';

// Components
import Layout from './components/Layout.js';
import PrivateRoute from './components/PrivateRoute.js';
import LoadingSpinner from './components/LoadingSpinner.js';
import InstallPrompt from './components/InstallPrompt.js';
import AuthErrorBoundary from './components/AuthErrorBoundary.js';
import AuthFallback from './components/AuthFallback.js';

// Styling
import { CssBaseline, ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material';
import { themeOptions } from './theme/theme.js';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';

// Initialize the theme
const theme = createTheme(themeOptions);

// Lazy load components
const DebugConfig = process.env.NODE_ENV === 'development' 
  ? React.lazy(() => import('./components/DebugConfig.js')) 
  : () => null;

const TestPickupFlow = process.env.NODE_ENV === 'development' 
  ? React.lazy(() => import('./tests/TestPickupFlow.js'))
  : () => null;

const CollectionTestFlow = process.env.NODE_ENV === 'development'
  ? React.lazy(() => import('./tests/CollectionTestFlow.js'))
  : () => null;

const CollectionFlowTest = process.env.NODE_ENV === 'development'
  ? React.lazy(() => import('./tests/CollectionFlowTest.js'))
  : () => null;

/**
 * Application content with auth state handling
 */
const AppContent = () => {
  const { isLoading, isAuthenticated, checkSession, authState, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Check session on mount and when pathname changes
  useEffect(() => {
    const handleAuthCheck = async () => {
      // Skip check if we're on a public route
      // Added root path (/) as a public route to prevent infinite redirects
      const isPublicRoute = ['/', '/login', '/register', '/reset-password'].includes(location.pathname);
      
      if (isPublicRoute) {
        // Don't do any session checks on public routes to prevent redirect loops
        return;
      }
      
      // Special case for test account - skip auth checks for development
      if (user && user.email === 'prince02@mailinator.com') {
        console.log('[App] Using test account - skipping auth check');
        return; // Allow navigation without redirect
      }
      
      // Skip auth checks in development mode completely
      if (process.env.NODE_ENV === 'development') {
        console.log('[App] Development mode - skipping auth session check');
        return;
      }
      
      // Check for development mode with mocks
      const appConfig = window.appConfig || {};
      const useDevelopmentMocks = appConfig.features && appConfig.features.enableMocks;
      if (useDevelopmentMocks) {
        console.log('[App] Development mode with mocks - skipping strict auth check');
        return;
      }
      
      // Only do strict auth checks in production
      try {
        const { error } = await checkSession();
        
        // If not authenticated and not on a public route, redirect to login
        if (error && !isAuthenticated) {
          console.log('[App] Not authenticated, redirecting to login:', error);
          navigate('/login', { 
            state: { from: location },
            replace: true 
          });
        }
      } catch (err) {
        console.error('[App] Auth check failed:', err);
        // In development, don't redirect on auth errors
        if (process.env.NODE_ENV === 'production') {
          navigate('/login', { 
            state: { from: location },
            replace: true 
          });
        }
      }
    };
    
    // Add a small delay to prevent auth check race conditions
    const timeoutId = setTimeout(handleAuthCheck, 100);
    
    return () => clearTimeout(timeoutId);
  }, [location.pathname, checkSession, isAuthenticated, navigate, location]);
  
  // Show loading spinner during initial load, but with a maximum time limit
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  // Show auth fallback UI when there's an authentication error
  if (authState?.status === 'ERROR' && authState?.error) {
    return <AuthFallback />;
  }
  
  // Render normal app routes when authenticated
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <InstallPrompt />
      <Routes>

            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Redirect root path to login */}
            <Route path="/" element={<Login />} />
            
            {/* Protected routes */}
            <Route element={<Layout />}>
              <Route path="/dashboard" element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              } />
              <Route path="/qr-scanner" element={
                <PrivateRoute>
                  <QRScanner />
                </PrivateRoute>
              } />
              <Route path="/pickup-request" element={
                <PrivateRoute>
                  <PickupRequest />
                </PrivateRoute>
              } />
              <Route path="/schedule-pickup" element={
                <PrivateRoute>
                  <SchedulePickup />
                </PrivateRoute>
              } />
              <Route path="/report" element={
                <PrivateRoute>
                  <DumpingReport />
                </PrivateRoute>
              } />
              <Route path="/rewards" element={
                <PrivateRoute>
                  <Rewards />
                </PrivateRoute>
              } />
              <Route path="/activity" element={
                <PrivateRoute>
                  <Activity />
                </PrivateRoute>
              } />
              <Route path="/schema-test" element={
                <PrivateRoute>
                  <SchemaTest />
                </PrivateRoute>
              } />
              <Route path="/collection/:collectionId" element={
                <PrivateRoute>
                  <CollectionForm />
                </PrivateRoute>
              } />
              <Route path="/collection-qr" element={
                <PrivateRoute>
                  <CollectionQRCode />
                </PrivateRoute>
              } />
              <Route path="/profile" element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              } />
              <Route path="/payment-methods" element={
                <PrivateRoute>
                  <PaymentMethods />
                </PrivateRoute>
              } />
              <Route path="/notifications" element={
                <PrivateRoute>
                  <Notifications />
                </PrivateRoute>
              } />
              <Route path="/collector-tracking" element={
                <PrivateRoute>
                  <CollectorTracking />
                </PrivateRoute>
              } />
              <Route path="/test-pickup" element={
                <PrivateRoute>
                  <TestPickupFlow />
                </PrivateRoute>
              } />
              <Route path="/test-collection" element={
                <PrivateRoute>
                  <CollectionTestFlow />
                </PrivateRoute>
              } />
              <Route path="/test-collection-flow" element={
                <PrivateRoute>
                  <CollectionFlowTest />
                </PrivateRoute>
              } />
            </Route>
            
            {/* 404 route */}
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">404</h1>
                <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">Page not found</p>
                <a 
                  href="/"
                  className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
                >
                  Go back to Dashboard
                </a>
              </div>
            } />
          </Routes>
        </Suspense>
  );
};

/**
 * Main application component with routing and context providers
 */
const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthErrorBoundary>
          <Suspense 
            fallback={
              <div className="flex justify-center items-center h-screen">
                <LoadingSpinner size="lg" />
              </div>
            }
          >
            <AppContent />
            {/* Debug component removed as requested */}
          </Suspense>
        </AuthErrorBoundary>
        <InstallPrompt />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
