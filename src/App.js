import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

// Import pages
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import QRScanner from './pages/QRScanner';
import PickupRequest from './pages/PickupRequest';
import SchedulePickup from './pages/SchedulePickup';
import DumpingReport from './pages/DumpingReport';
import Rewards from './pages/Rewards';
import Activity from './pages/Activity';
import Profile from './pages/Profile';

/**
 * Main application component with routing and context providers
 */
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Suspense fallback={
          <div className="flex justify-center items-center h-screen">
            <LoadingSpinner size="lg" />
          </div>
        }>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Protected routes */}
            <Route element={<Layout />}>
              <Route path="/" element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              } />
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
              <Route path="/profile" element={
                <PrivateRoute>
                  <Profile />
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
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
