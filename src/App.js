import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';

// Context Providers
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { NetworkProvider } from './utils/networkMonitor.js';
import { OfflineQueueProvider } from './context/OfflineQueueContext.js';
import supabase from './utils/supabaseClient.js';

// Pages
import Login from './pages/Login.js';
import Register from './pages/Register.js';
import ResetPassword from './pages/ResetPassword.js';
import ResetPasswordConfirm from './pages/ResetPasswordConfirm.js';
import Profile from './pages/Profile.js';
import Dashboard from './pages/Dashboard.js';
import DigitalBin from './pages/DigitalBin.js';
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
import ToastTest from './pages/ToastTest.js';

// Components
import Layout from './components/Layout.js';
// Auth notification removed - no longer using fallback auth
import PrivateRoute from './components/PrivateRoute.js';
import LoadingSpinner from './components/LoadingSpinner.js';
import InstallPrompt from './components/InstallPrompt.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import AppPerformanceProvider from './components/AppPerformanceProvider.js';
import AppPerformanceOptimizer from './components/AppPerformanceOptimizer.js';
import ToastProvider from './components/ToastProvider.js';
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
  
  // Load and apply theme from database when user logs in
  useEffect(() => {
    console.log('[App Theme] ⚡ useEffect TRIGGERED, user:', user);
    console.log('[App Theme] ⚡ user?.id:', user?.id);
    
    const loadAndApplyTheme = async () => {
      if (!user?.id) {
        console.log('[App Theme] ❌ No user ID, skipping theme load');
        return;
      }
      
      try {
        console.log('[App Theme] 🎨 Loading theme for user:', user.id);
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('dark_mode')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) {
          console.error('[App Theme] ❌ Error loading theme:', error);
          return;
        }
        
        const isDark = profileData?.dark_mode || false;
        console.log('[App Theme] 📦 Theme from database:', isDark ? 'DARK' : 'LIGHT', profileData);
        
        // Apply theme
        if (isDark) {
          document.documentElement.classList.add('dark');
          document.body.classList.add('dark');
          console.log('[App Theme] ✅ DARK MODE APPLIED to documentElement and body');
        } else {
          document.documentElement.classList.remove('dark');
          document.body.classList.remove('dark');
          console.log('[App Theme] ✅ LIGHT MODE APPLIED to documentElement and body');
        }
      } catch (error) {
        console.error('[App Theme] ❌ Error in loadAndApplyTheme:', error);
      }
    };
    
    loadAndApplyTheme();
  }, [user?.id]);
  
  // Force white background immediately on mount
  useEffect(() => {
    console.log('[App] AppContent mounted - forcing white background');
    document.body.style.backgroundColor = '#ffffff';
    document.documentElement.style.backgroundColor = '#ffffff';
    const root = document.getElementById('root');
    if (root) {
      root.style.backgroundColor = '#ffffff';
    }
  }, []);
  
  // Mark app as loaded after successful initialization
  useEffect(() => {
    if (!isLoading) {
      // Add class to HTML element to allow theme styling
      document.documentElement.classList.add('app-loaded');
      console.log('[App] App initialization complete - marking as loaded');
    } else {
      console.log('[App] Still loading...', { authState: authState?.status });
    }
  }, [isLoading, authState?.status]);
  
  // Persist last visited path for bookmark/refresh restore
  useEffect(() => {
    try {
      if (location?.pathname) {
        sessionStorage.setItem('trashdrop_last_path', location.pathname + (location.search || ''));
      }
    } catch (_) {}
  }, [location?.pathname, location?.search]);

  // Restore last path after refresh if authenticated and at root/public
  useEffect(() => {
    try {
      const lastPath = sessionStorage.getItem('trashdrop_last_path');
      const isPublic = ['/', '/login', '/register', '/reset-password', '/reset-password-confirm'].includes(location.pathname);
      if (isAuthenticated && lastPath && isPublic && lastPath !== location.pathname) {
        navigate(lastPath, { replace: true });
      }
    } catch (_) {}
  }, [isAuthenticated]);

  // Check session on mount and when pathname changes
  useEffect(() => {
    const handleAuthCheck = async () => {
      console.log('[App] Auth check triggered for path:', location.pathname);
      
      // Skip check if we're on a public route
      const isPublicRoute = ['/', '/login', '/register', '/reset-password', '/reset-password-confirm'].includes(location.pathname);
      
      // Allow access if we have stored user data, even during auth check
      const hasStoredUser = localStorage.getItem('trashdrop_user');
      
      console.log('[App] Auth check conditions:', {
        isPublicRoute,
        hasStoredUser: !!hasStoredUser,
        isAuthenticated,
        isLoading,
        pathname: location.pathname
      });
      
      if (isPublicRoute) {
        console.log('[App] Skipping auth check - public route');
        return;
      }
      
      // Additional safety: don't run auth checks if we're still loading
      if (isLoading) {
        console.log('[App] Auth still loading - skipping auth check');
        return;
      }
      
      // If not authenticated and not on a public route, redirect to login
      // AuthContext already handles session management, we just check the state
      if (!isAuthenticated && !hasStoredUser) {
        console.log('[App] Not authenticated, redirecting to login');
        navigate('/login', { 
          state: { from: location },
          replace: true 
        });
      }
    };
    
    // Add a small delay to prevent auth check race conditions
    const timeoutId = setTimeout(handleAuthCheck, 100);
    
    return () => clearTimeout(timeoutId);
  }, [location.pathname, checkSession, isAuthenticated, navigate, location]);
  
  // NO LOADING STATE - Render immediately based on auth status
  console.log('[AppContent] Rendering immediately - isAuthenticated:', isAuthenticated, 'status:', authState?.status);
  
  // Render normal app routes when authenticated
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-screen bg-white" style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>
        <LoadingSpinner size="lg" />
      </div>
    }>
      <InstallPrompt />
      <Routes>

            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password-confirm" element={<ResetPasswordConfirm />} />
            
            {/* Root route: if authenticated or has stored data, go to dashboard; else login */}
            <Route
              path="/"
              element={
                isAuthenticated || localStorage.getItem('trashdrop_user') ? 
                <Navigate to="/dashboard" replace /> : 
                <Login />
              }
            />
            
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
              <Route path="/digital-bin" element={
                <PrivateRoute>
                  <DigitalBin />
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
              <Route path="/toast-test" element={
                <PrivateRoute>
                  <ToastTest />
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
    <AppPerformanceProvider>
      <ThemeProvider>
        <ToastProvider position="top-right" maxToasts={5}>
          <AuthProvider>
            <AuthErrorBoundary>
              <AppPerformanceOptimizer />
              <Suspense 
                fallback={
                  <div className="flex justify-center items-center h-screen bg-white" style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>
                    <LoadingSpinner size="lg" />
                  </div>
                }
              >
                <AppContent />
              </Suspense>
            </AuthErrorBoundary>
            <InstallPrompt />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </AppPerformanceProvider>
  );
};

export default App;
