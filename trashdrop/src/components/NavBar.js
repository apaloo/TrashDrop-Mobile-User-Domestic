import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { notificationService } from '../services/notificationService.js';
import supabase from '../utils/supabaseClient.js';
import SignOutModal from './SignOutModal.js';

/**
 * Main navigation component for the application
 * Displays different links based on authentication state
 */
const NavBar = () => {
  const { isAuthenticated, signOut, user } = useAuth();
  const navigate = useNavigate();
  // ThemeProvider temporarily disabled - use fallback
  let theme = 'light';
  let toggleTheme = () => {};
  try {
    const themeContext = useTheme();
    theme = themeContext.theme;
    toggleTheme = themeContext.toggleTheme;
  } catch (e) {
    // ThemeProvider not available, use defaults
  }
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const dropdownRef = useRef(null);

  // Get user initials from name
  const getUserInitials = () => {
    // Try user_metadata.full_name first
    const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (fullName) {
      const names = fullName.trim().split(' ').filter(n => n);
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return names[0]?.[0]?.toUpperCase() || 'U';
    }
    // Fallback to email first letter
    return user?.email?.[0]?.toUpperCase() || 'U';
  };

  const handleSignOut = () => {
    console.log('[NavBar] handleSignOut called, setting modal to true');
    // Show custom modal instead of browser confirm
    setShowSignOutModal(true);
  };

  const handleSignOutConfirm = async () => {
    console.log('[NavBar] Sign out initiated');
    setIsSigningOut(true);
    
    try {
      // Call signOut from AuthContext to properly clean up state
      const result = await signOut();
      
      if (result.success) {
        console.log('[NavBar] Sign out successful, navigating to login');
        // Use React Router navigation instead of hard redirect
        navigate('/login', { replace: true });
      } else {
        console.error('[NavBar] Sign out failed:', result.error);
        // Show error to user but still navigate to login
        alert('There was an issue signing out, but you will be redirected to the login page.');
        navigate('/login', { replace: true });
      }
      
    } catch (error) {
      console.error('[NavBar] Sign out error:', error);
      // Show error to user but still navigate to login
      alert('An unexpected error occurred during sign out. You will be redirected to the login page.');
      console.log('[NavBar] Force navigating to login due to error');
      navigate('/login', { replace: true });
    } finally {
      setIsSigningOut(false);
      setShowSignOutModal(false);
    }
  };

  const handleSignOutCancel = () => {
    console.log('[NavBar] handleSignOutCancel called, setting modal to false');
    setShowSignOutModal(false);
  };

  // Active link style
  const activeStyle = "text-[#4CAF50] font-bold";
  const inactiveStyle = "text-gray-600 hover:text-[#4CAF50]";
  
  // Active style for bottom navigation
  const activeBottomNavStyle = "text-[#4CAF50] font-bold";
  const inactiveBottomNavStyle = "text-gray-500";

  // Toggle profile dropdown
  const toggleProfileDropdown = () => {
    setProfileDropdownOpen(!profileDropdownOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };

    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [profileDropdownOpen]);

  // Fetch unread notifications count
  useEffect(() => {
    if (!user?.id) return;

    const fetchUnreadCount = async () => {
      try {
        const { data } = await notificationService.getUserNotifications(user.id, {
          status: 'unread',
          limit: 100
        });
        setUnreadCount(data?.length || 0);
      } catch (err) {
        console.error('[NavBar] Error fetching unread count:', err);
      }
    };

    fetchUnreadCount();

    // Subscribe to real-time notification updates
    const notificationSubscription = supabase
      .channel(`navbar_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          // Increment unread count
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Refresh count when notifications are marked as read
          if (payload.new.status === 'read' && payload.old.status === 'unread') {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationSubscription);
    };
  }, [user?.id]);
  
  return (
    <>
      <nav className="bg-white dark:bg-gray-800 py-3 px-4 shadow-md fixed top-0 left-0 right-0 z-50">
        <div className="container mx-auto flex flex-wrap items-center justify-between">
          {/* Logo and Title */}
          <NavLink to="/" className="flex items-center space-x-3 text-[#4CAF50] dark:text-[#66BB6A] text-2xl font-bold">
            {/* Light mode logo */}
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1 dark:hidden">
              <img src="/logo.svg" alt="TrashDrop Logo" className="w-full h-full object-contain" />
            </div>
            {/* Dark mode logo */}
            <div className="w-12 h-12 hidden dark:flex items-center justify-center">
              <img src="/logo-02.svg" alt="TrashDrop Logo" className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <span>TrashDrop</span>
          </NavLink>

          {/* Mobile User Profile */}
          {isAuthenticated && (
            <div className="md:hidden relative" ref={dropdownRef}>
              <button 
                onClick={toggleProfileDropdown}
                className="flex items-center space-x-2 p-2 text-[#4CAF50] focus:outline-none focus:ring-2 focus:ring-[#4CAF50] rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Profile menu"
              >
                <div className="w-10 h-10 rounded-full bg-[#4CAF50] flex items-center justify-center text-white text-sm font-medium">
                  {getUserInitials()}
                </div>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Mobile Profile Dropdown */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-700 rounded-md shadow-lg py-2 z-60 border border-gray-200 dark:border-gray-600">
                  <NavLink to="/profile" className="block px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">
                    Your Profile
                  </NavLink>
                  <div className="border-t border-gray-200 dark:border-gray-600"></div>
                  <button
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-h-[44px]"
                  >
                    {isSigningOut ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Signing out...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Desktop Menu */}
          <div className="hidden md:flex md:items-center space-x-1">
            {isAuthenticated ? (
              <>
                <NavLink 
                  to="/dashboard" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Dashboard
                </NavLink>
                <NavLink 
                  to="/qr-scanner" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Scan QR
                </NavLink>
                <NavLink 
                  to="/pickup-request" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Request Pickup
                </NavLink>
                <NavLink 
                  to="/report" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Report Dumping
                </NavLink>
                <NavLink 
                  to="/rewards" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Rewards
                </NavLink>
                <NavLink 
                  to="/activity" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Activity
                </NavLink>
                <NavLink 
                  to="/notifications" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors relative
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  <div className="relative inline-block">
                    <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>
                </NavLink>
                <NavLink 
                  to="/profile" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Profile
                </NavLink>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    alert('DEBUG: Desktop Sign Out button clicked!');
                    console.log('[NavBar] Desktop Sign Out button clicked');
                    handleSignOut();
                  }}
                  disabled={isSigningOut}
                  className="px-3 py-2 rounded-md text-sm font-medium text-red-600 border border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSigningOut ? (
                    <>
                      <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing out...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <NavLink 
                  to="/login" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Login
                </NavLink>
                <NavLink 
                  to="/register" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Register
                </NavLink>
              </>
            )}
            
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-md text-white bg-primary hover:bg-primary-dark transition-colors"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Add padding to compensate for fixed navbar */}
      <div className="pt-16 md:pt-14"></div>
      
      {/* Mobile Bottom Navigation */}
      {isAuthenticated && (
        <div className="mobile-bottom-nav-container">
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-lg z-50">
            <div className="flex justify-between items-center px-4 py-2">
              <NavLink 
                to="/dashboard" 
                className={({ isActive }) => `
                  flex flex-col items-center py-1 px-3 font-medium transition-colors
                  ${isActive ? activeBottomNavStyle : inactiveBottomNavStyle}
                `}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="text-xs">Dashboard</span>
              </NavLink>
              
              <NavLink 
                to="/qr-scanner" 
                className={({ isActive }) => `
                  flex flex-col items-center py-1 px-3 font-medium transition-colors
                  ${isActive ? activeBottomNavStyle : inactiveBottomNavStyle}
                `}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span className="text-xs">Scan QR</span>
              </NavLink>
              
              <NavLink 
                to="/pickup-request" 
                className={({ isActive }) => `
                  flex flex-col items-center py-1 px-3 font-medium transition-colors
                  ${isActive ? activeBottomNavStyle : inactiveBottomNavStyle}
                `}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span className="text-xs">Request Pickup</span>
              </NavLink>
              
              <NavLink 
                to="/report" 
                className={({ isActive }) => `
                  flex flex-col items-center py-1 px-3 font-medium transition-colors
                  ${isActive ? activeBottomNavStyle : inactiveBottomNavStyle}
                `}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs">Report</span>
              </NavLink>

            </div>
          </nav>
          {/* <div className="pb-16 md:pb-0"></div> */}
        </div>
      )}
      
      {/* Sign Out Modal */}
      <SignOutModal
        isOpen={showSignOutModal}
        onClose={handleSignOutCancel}
        onConfirm={handleSignOutConfirm}
        isSigningOut={isSigningOut}
      />
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black text-white p-2 text-xs z-[10000]">
          Modal State: {showSignOutModal ? 'OPEN' : 'CLOSED'}
        </div>
      )}
    </>
  );
};

export default NavBar;
