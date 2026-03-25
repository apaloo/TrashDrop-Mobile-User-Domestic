import React, { useState } from 'react';
import { FiWifi, FiWifiOff, FiRefreshCw } from 'react-icons/fi';

/**
 * Network Test Page - For testing the NetworkStatusRibbon component
 */
const NetworkTest = () => {
  const [currentStatus, setCurrentStatus] = useState(navigator.onLine);
  const [lastAction, setLastAction] = useState('');

  const checkStatus = () => {
    setCurrentStatus(navigator.onLine);
    setLastAction('Status checked');
  };

  const simulateOffline = () => {
    setLastAction('Simulating offline...');
    window.dispatchEvent(new Event('offline'));
    setTimeout(() => {
      setCurrentStatus(false);
      setLastAction('Offline simulation complete');
    }, 100);
  };

  const simulateOnline = () => {
    setLastAction('Simulating online...');
    window.dispatchEvent(new Event('online'));
    setTimeout(() => {
      setCurrentStatus(true);
      setLastAction('Online simulation complete');
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Network Status Ribbon Test</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Current Network Status</h2>
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
              currentStatus ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {currentStatus ? <FiWifi className="w-5 h-5" /> : <FiWifiOff className="w-5 h-5" />}
              <span className="font-medium">
                {currentStatus ? 'Online' : 'Offline'}
              </span>
            </div>
            <button
              onClick={checkStatus}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <FiRefreshCw className="w-4 h-4" />
              <span>Check Status</span>
            </button>
          </div>
          {lastAction && (
            <p className="mt-4 text-sm text-gray-600">Last action: {lastAction}</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Test Controls</h2>
          <div className="space-y-4">
            <button
              onClick={simulateOffline}
              className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
            >
              <FiWifiOff className="w-5 h-5" />
              <span>Simulate Going Offline</span>
            </button>
            <button
              onClick={simulateOnline}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
            >
              <FiWifi className="w-5 h-5" />
              <span>Simulate Coming Online</span>
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-3">How to Test</h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-700">
            <li>Click "Simulate Going Offline" to see the red ribbon appear</li>
            <li>The ribbon will show "You are not connected to the internet"</li>
            <li>You can dismiss the ribbon using the X button</li>
            <li>Click "Simulate Coming Online" to see the green success indicator</li>
            <li>The green indicator will show "Connection restored" for 3 seconds</li>
            <li>You can also test using browser dev tools: Network tab → Offline</li>
          </ol>
        </div>

        <div className="bg-gray-100 rounded-lg p-6 mt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Console Commands</h3>
          <p className="text-sm text-gray-600 mb-4">You can also use these commands in the browser console:</p>
          <div className="bg-gray-800 text-green-400 p-4 rounded font-mono text-sm">
            <div>simulateOffline() // Go offline</div>
            <div>simulateOnline() // Come online</div>
            <div>checkNetworkStatus() // Check current status</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkTest;
