import React, { useState } from 'react';
import { toastService } from '../services/toastService';
import '../styles/ToastNotification.css';

/**
 * Toast Notification Test Page
 * This page demonstrates all toast notification features:
 * - Different toast types (info, success, warning, error)
 * - Persistent toasts
 * - Different positions
 * - Custom durations
 */
const ToastTest = () => {
  const [position, setPosition] = useState('top-right');
  const [duration, setDuration] = useState(4000);
  const [message, setMessage] = useState('This is a toast notification message');
  
  // Show a basic toast of the specified type
  const showToast = (type) => {
    toastService.show(message, {
      type,
      duration,
      position
    });
  };

  // Show a persistent toast that doesn't auto-dismiss
  const showPersistentToast = (type) => {
    toastService.show(message, {
      type,
      duration: 0, // 0 duration makes it persistent
      position
    });
  };

  // Demo all toast types in sequence
  const demoAllToasts = () => {
    // Clear any existing toasts
    toastService.clear();
    
    // Show all types with a delay between each
    setTimeout(() => toastService.info('This is an info toast', { position }), 0);
    setTimeout(() => toastService.success('This is a success toast', { position }), 1000);
    setTimeout(() => toastService.warning('This is a warning toast', { position }), 2000);
    setTimeout(() => toastService.error('This is an error toast', { position }), 3000);
    setTimeout(() => toastService.show('This is a persistent toast that requires manual dismissal', { 
      type: 'info', 
      duration: 0,
      position
    }), 4000);
  };

  // Demo location-related toast scenarios
  const demoGeolocationScenarios = () => {
    toastService.warning(
      'Location request timed out. Using approximate location instead. You can adjust by tapping on the map.',
      { duration: 4000, position }
    );
    
    setTimeout(() => {
      toastService.error(
        'Location access denied. Using approximate location. You can adjust by tapping on the map.',
        { duration: 4000, position }
      );
    }, 4500);
    
    setTimeout(() => {
      toastService.success(
        'Report submitted successfully!',
        { duration: 4000, position }
      );
    }, 9000);
  };

  // Clear all toasts
  const clearAllToasts = () => {
    toastService.clear();
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Toast Notification Test</h1>
      
      {/* Configuration Options */}
      <div className="mb-6 p-4 border rounded bg-gray-100 dark:bg-gray-800">
        <h2 className="text-lg font-semibold mb-3">Toast Configuration</h2>
        
        {/* Toast Message */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Message:</label>
          <input 
            type="text" 
            value={message} 
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        
        {/* Position Selector */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Position:</label>
          <select 
            value={position} 
            onChange={(e) => setPosition(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="top-right">Top Right</option>
            <option value="top-left">Top Left</option>
            <option value="top-center">Top Center</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-center">Bottom Center</option>
          </select>
        </div>
        
        {/* Duration Selector */}
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Duration (ms):</label>
          <select 
            value={duration} 
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full p-2 border rounded"
          >
            <option value="2000">2000 (2s) - Quick</option>
            <option value="4000">4000 (4s) - Default</option>
            <option value="6000">6000 (6s) - Long</option>
            <option value="0">0 - Persistent (manual dismiss)</option>
          </select>
        </div>
      </div>
      
      {/* Individual Toast Buttons */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Basic Toast Types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button 
            onClick={() => showToast('info')}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Show Info Toast
          </button>
          
          <button 
            onClick={() => showToast('success')}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
          >
            Show Success Toast
          </button>
          
          <button 
            onClick={() => showToast('warning')}
            className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
          >
            Show Warning Toast
          </button>
          
          <button 
            onClick={() => showToast('error')}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Show Error Toast
          </button>
        </div>
      </div>
      
      {/* Persistent Toast Buttons */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Persistent Toasts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button 
            onClick={() => showPersistentToast('info')}
            className="border-2 border-blue-500 text-blue-500 hover:bg-blue-100 px-4 py-2 rounded"
          >
            Persistent Info
          </button>
          
          <button 
            onClick={() => showPersistentToast('success')}
            className="border-2 border-green-500 text-green-500 hover:bg-green-100 px-4 py-2 rounded"
          >
            Persistent Success
          </button>
          
          <button 
            onClick={() => showPersistentToast('warning')}
            className="border-2 border-yellow-500 text-yellow-500 hover:bg-yellow-100 px-4 py-2 rounded"
          >
            Persistent Warning
          </button>
          
          <button 
            onClick={() => showPersistentToast('error')}
            className="border-2 border-red-500 text-red-500 hover:bg-red-100 px-4 py-2 rounded"
          >
            Persistent Error
          </button>
        </div>
      </div>
      
      {/* Demo Scenarios */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Demo Scenarios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button 
            onClick={demoAllToasts}
            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded"
          >
            Show All Toast Types
          </button>
          
          <button 
            onClick={demoGeolocationScenarios}
            className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Demo Geolocation Messages
          </button>
          
          <button 
            onClick={clearAllToasts}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Clear All Toasts
          </button>
        </div>
      </div>
      
      {/* Utility Info */}
      <div className="mt-8 p-4 border rounded bg-gray-100 dark:bg-gray-800">
        <h3 className="font-medium mb-2">Toast Service Usage</h3>
        <pre className="bg-gray-200 dark:bg-gray-700 p-3 rounded text-sm overflow-x-auto">
          {`// Basic usage
toastService.info('Info message');
toastService.success('Success message');
toastService.warning('Warning message');
toastService.error('Error message');

// With options
toastService.show('Custom message', {
  type: 'info', // 'info', 'success', 'warning', 'error'
  duration: 4000, // ms, 0 for persistent
  position: 'top-right' // positioning
});`}
        </pre>
      </div>
    </div>
  );
};

export default ToastTest;
