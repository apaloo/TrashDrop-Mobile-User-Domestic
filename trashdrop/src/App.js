import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import LoadingSpinner from './components/LoadingSpinner.js';
import PrivateRoute from './components/PrivateRoute.js';
import Layout from './components/Layout.js';
import InstallPrompt from './components/InstallPrompt.js';
import NetworkStatusRibbon from './components/NetworkStatusRibbon.js';

// Regular imports for common components
import Login from './pages/Login.js';
import Register from './pages/Register.js';
import Dashboard from './pages/Dashboard.js';
import QRScanner from './pages/QRScanner.js';
import PickupRequest from './pages/PickupRequest.js';
import DigitalBin from './pages/DigitalBin.js';
import DumpingReport from './pages/DumpingReport.js';
import Rewards from './pages/Rewards.js';
import Activity from './pages/Activity.js';
import SchemaTest from './pages/SchemaTest.js';
import CollectionForm from './pages/CollectionForm.js';
import CollectionQRCode from './pages/CollectionQRCode.js';
import Profile from './pages/Profile.js';
import PaymentMethods from './pages/PaymentMethods.js';
import Notifications from './pages/Notifications.js';
import CollectorTracking from './pages/CollectorTracking.js';
import ToastTest from './pages/ToastTest.js';
import ResetPassword from './pages/ResetPassword.js';
import ResetPasswordConfirm from './pages/ResetPasswordConfirm.js';
import AuthCallback from './pages/AuthCallback.js';
import NetworkTest from './pages/NetworkTest.js';

// Performance and error handling
import AppPerformanceProvider from './components/AppPerformanceProvider.js';
import AppPerformanceOptimizer from './components/AppPerformanceOptimizer.js';
import ToastProvider from './components/ToastProvider.js';
import AuthErrorBoundary from './components/AuthErrorBoundary.js';
import AuthFallback from './components/AuthFallback.js';
import PwaInitializer from './components/PwaInitializer.js';
import PwaRecovery from './components/PwaRecovery.js';
import ForceInstallPrompt from './components/ForceInstallPrompt.js';

// Styling
import { CssBaseline, ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material';
import { themeOptions } from './theme/theme.js';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';

// Import network test utility for development
import './utils/networkTest.js';

// Dynamic imports for lazy loading (moved after all imports)
const importDebugConfig = () => import('./components/DebugConfig.js');

// Lazy load components using the dynamic imports
const DebugConfig = process.env.NODE_ENV === 'development' 
  ? React.lazy(importDebugConfig) 
  : () => null;

// Initialize the theme
const theme = createTheme(themeOptions);

/**
 * App content component with routing logic
 */
const AppContent = () => {
  const { isAuthenticated, isLoading, authState, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Check session on mount and when pathname changes
  useEffect(() => {
    const handleAuthCheck = async () => {
      console.log('[App] Auth check triggered for path:', location.pathname);
      
      // Skip check if we're on a public route
      const isPublicRoute = ['/', '/login', '/register', '/reset-password', '/reset-password-confirm', '/auth/callback'].includes(location.pathname);
      
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
        // If authenticated user is on login/register, redirect to dashboard
        if (isAuthenticated && !isLoading && (location.pathname === '/login' || location.pathname === '/register')) {
          console.log('[App] Authenticated user on public route, redirecting to dashboard');
          navigate('/dashboard', { replace: true });
          return;
        }
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
  }, [location.pathname, isAuthenticated, isLoading, navigate, location]);
  
  console.log('[AppContent] Rendering - isAuthenticated:', isAuthenticated, 'isLoading:', isLoading);

  // Render normal app routes when authenticated
  return (
    <>
      <NetworkStatusRibbon />
      <InstallPrompt />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={
          isLoading ? (
            <div className="flex justify-center items-center h-screen bg-white">
              <LoadingSpinner size="lg" />
            </div>
          ) :
          <Login />
        } />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password-confirm" element={<ResetPasswordConfirm />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
        {/* Root route: if authenticated, go to dashboard; else login */}
        <Route
          path="/"
          element={
            isAuthenticated ? 
            <Navigate to="/dashboard" replace /> : 
            isLoading ? (
              <div className="flex justify-center items-center h-screen bg-white">
                <LoadingSpinner size="lg" />
              </div>
            ) :
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
          <Route path="/network-test" element={
            <PrivateRoute>
              <NetworkTest />
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
    </>
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
            <ForceInstallPrompt />
            <PwaInitializer />
            <PwaRecovery />
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
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </AppPerformanceProvider>
  );
};

export default App;
