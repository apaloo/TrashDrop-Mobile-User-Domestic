import React from 'react';
import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import OfflineIndicator from './OfflineIndicator';

/**
 * Main layout component that wraps all pages
 * Provides consistent structure with navigation and offline indicator
 */
const Layout = () => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar />
      <OfflineIndicator />
      <main className="flex-grow container mx-auto px-4 py-6">
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
