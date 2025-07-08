import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from './NavBar';
import OfflineIndicator from './OfflineIndicator';

/**
 * Main layout component that wraps all pages
 * Provides consistent structure with navigation and offline indicator
 * Includes improved spacing for mobile view to prevent content overlap with fixed navigation
 */
const Layout = () => {
  const location = useLocation();
  const [hasBottomPadding, setHasBottomPadding] = useState(false);
  
  // Determine if the current page needs extra bottom padding
  // Pages with maps or that extend to the bottom of the screen
  useEffect(() => {
    const pagesWithMaps = [
      '/pickup-request',
      '/report',
      '/schedule-pickup',
      '/', // Dashboard is at root path
      '/dashboard'
    ];
    
    setHasBottomPadding(pagesWithMaps.includes(location.pathname));
  }, [location.pathname]);
  
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar />
      <OfflineIndicator />
      {/* Add extra bottom padding for pages with maps on mobile */}
      <main className={`flex-grow container mx-auto px-4 pt-6 ${hasBottomPadding ? 'pb-32 md:pb-6' : 'pb-6'}`}>
        <Outlet />
      </main>
      <footer className="bg-gray-100 dark:bg-gray-800 py-4 text-center text-gray-600 dark:text-gray-400 text-sm">
        <div className="container mx-auto">
          <p>&copy; {new Date().getFullYear()} TrashDrop. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
