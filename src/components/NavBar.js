import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';

/**
 * Main navigation component for the application
 * Displays different links based on authentication state
 */
const NavBar = () => {
  const { isAuthenticated, signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
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
  
  return (
    <>
      <nav className="bg-white py-3 px-4 shadow-md fixed top-0 left-0 right-0 z-10">
        <div className="container mx-auto flex flex-wrap items-center justify-between">
          {/* Logo and Title */}
          <NavLink to="/" className="flex items-center space-x-3 text-[#4CAF50] text-2xl font-bold">
            <img src="/logo.svg" alt="TrashDrop Logo" className="w-12 h-12" />
            <span>TrashDrop</span>
          </NavLink>

          {/* Mobile User Profile */}
          {isAuthenticated && (
            <div className="md:hidden relative">
              <button 
                onClick={toggleProfileDropdown}
                className="flex items-center space-x-1 text-[#4CAF50] focus:outline-none"
              >
                <div className="w-8 h-8 rounded-full bg-[#4CAF50] flex items-center justify-center text-white">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Mobile Profile Dropdown */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20">
                  <NavLink to="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    Your Profile
                  </NavLink>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Sign Out
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
                  to="/profile" 
                  className={({ isActive }) => `
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive ? activeStyle : inactiveStyle}
                  `}
                >
                  Profile
                </NavLink>
                <button
                  onClick={handleSignOut}
                  className="px-3 py-2 rounded-md text-sm font-medium text-white bg-primary hover:bg-primary-dark transition-colors"
                >
                  Sign Out
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
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-lg z-50">
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
          <div className="pb-16 md:pb-0"></div>
        </div>
      )}
    </>
  );
};

export default NavBar;
