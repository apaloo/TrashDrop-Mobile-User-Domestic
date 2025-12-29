import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

/**
 * Debug panel to diagnose dark screen issue
 * Shows visible information about app state
 */
const DebugPanel = () => {
  const { authState, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [renderTime, setRenderTime] = useState(Date.now());
  
  useEffect(() => {
    setRenderTime(Date.now());
  }, []);
  
  const debugInfo = {
    'Time': new Date().toLocaleTimeString(),
    'Render Time': `${Date.now() - renderTime}ms ago`,
    'Auth Status': authState?.status || 'unknown',
    'Is Authenticated': isAuthenticated ? 'YES' : 'NO',
    'Is Loading': isLoading ? 'YES' : 'NO',
    'Current Path': location.pathname,
    'Has User': authState?.user ? 'YES' : 'NO',
    'Theme Attr': document.documentElement.getAttribute('data-theme') || 'none',
    'Has Dark Class': document.documentElement.classList.contains('dark') ? 'YES' : 'NO',
    'Has App-Loaded': document.documentElement.classList.contains('app-loaded') ? 'YES' : 'NO',
    'Body BG': window.getComputedStyle(document.body).backgroundColor,
    'Root BG': window.getComputedStyle(document.getElementById('root')).backgroundColor,
  };
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: '#ffff00',
      color: '#000000',
      padding: '10px',
      fontSize: '12px',
      zIndex: 99999,
      fontFamily: 'monospace',
      maxHeight: '50vh',
      overflow: 'auto',
      border: '3px solid #ff0000'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '14px' }}>
        🔍 DEBUG PANEL - If you see this, React is LOADED
      </div>
      {Object.entries(debugInfo).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '3px' }}>
          <strong>{key}:</strong> {String(value)}
        </div>
      ))}
      <div style={{ marginTop: '10px', padding: '5px', backgroundColor: '#fff', border: '1px solid #000' }}>
        <strong>Console Logs:</strong> Check browser console for [Auth] and [AppContent] messages
      </div>
    </div>
  );
};

export default DebugPanel;
