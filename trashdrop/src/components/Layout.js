import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from './NavBar.js';
import BinReminderPopup from './BinReminderPopup.js';
import { ArrivalQRProvider } from '../context/ArrivalQRContext.js';
import LocationOffBanner from './LocationOffBanner.js';

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
      '/digital-bin',
      '/', // Dashboard is at root path
      '/dashboard'
    ];
    
    setHasBottomPadding(pagesWithMaps.includes(location.pathname));
  }, [location.pathname]);
  
  console.log('[Layout] Layout rendering, location:', location.pathname);
  
  return (
    // Signed-in pages share one watcher for the collector reaching a digital bin
    <ArrivalQRProvider>
      <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900" style={{ minHeight: '100vh' }}>
        <NavBar />
        {/* One tap to turn location on, above the bottom bar */}
        <LocationOffBanner />
        {/* Day-before reminder for repeat digital bin collections */}
        <BinReminderPopup />
        {/* Add extra bottom padding for pages with maps on mobile */}
        <main className={`flex-grow container mx-auto px-2 md:px-4 ${hasBottomPadding ? 'pb-10 xl:pb-6' : 'pb-2 xl:pb-6'}`}>
          <Outlet />
        </main>
        <footer className="bg-gray-100 dark:bg-gray-800 py-4 text-center text-td-sage dark:text-gray-300 text-sm">
          <div className="container mx-auto">
            <p>&copy; {new Date().getFullYear()} TrashDrop. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </ArrivalQRProvider>
  );
};

export default Layout;
