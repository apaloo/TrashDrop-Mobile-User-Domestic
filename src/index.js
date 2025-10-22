import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.js';
import reportWebVitals from './reportWebVitals';

// Debug initialization tracking
function logAppDebug(message, data) {
  if (window.debugReport) {
    window.debugReport('React: ' + message, data);
  } else {
    console.log('[React Debug]', message, data || '');
  }
}

// Track initial React render
logAppDebug('React initialization starting');

// Initialize the app
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
    }
  });
}

// Error boundary component to catch errors in React tree
// IMPORTANT: Must be defined BEFORE it's used in the render call
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logAppDebug('React error caught in boundary', {
      error: error.message,
      componentStack: errorInfo.componentStack
    });
    
    if (window.appState) {
      window.appState.reactErrorBoundary = {
        message: error.message,
        componentStack: errorInfo.componentStack
      };
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', margin: '20px', border: '2px solid #f0ad4e', borderRadius: '8px', backgroundColor: '#fcf8e3' }}>
          <h3>Application Error</h3>
          <p>Something went wrong while loading the application.</p>
          <p><strong>Error:</strong> {this.state.error && this.state.error.toString()}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', margin: '10px 0', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Reload Application
          </button>
          <button
            onClick={() => document.getElementById('debug-console').style.display = 'block'}
            style={{ padding: '8px 16px', margin: '10px 0 10px 10px', backgroundColor: '#f1f1f1', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Show Debug Info
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Error handling for React initialization
try {
  logAppDebug('Creating React root');
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    throw new Error('Root element #root not found in DOM');
  }
  
  const root = ReactDOM.createRoot(rootElement);
  
  // Track React states
  if (window.appState) {
    window.appState.reactRootCreated = true;
  }
  
  logAppDebug('Rendering React application');
  
  root.render(
    <React.StrictMode>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <React.Fragment>
          {/* Error boundary for React initialization */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </React.Fragment>
      </BrowserRouter>
    </React.StrictMode>
  );
  
  logAppDebug('React render complete');
  
  // Track successful render
  if (window.appState) {
    window.appState.reactRendered = true;
  }
  
} catch (error) {
  logAppDebug('React initialization failed', {
    errorMessage: error.message,
    stack: error.stack
  });
  
  // Display error in DOM
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; margin: 20px; border: 2px solid red; background-color: #fff8f8;">
        <h3>React Initialization Error</h3>
        <p>${error.message}</p>
        <pre style="overflow: auto; max-height: 200px; background: #f5f5f5; padding: 10px; border-radius: 4px;">${error.stack}</pre>
        <button onclick="window.location.reload()" style="padding: 8px 16px; margin-top: 15px; background: #4CAF50; color: white; border: none; border-radius: 4px;">Reload App</button>
      </div>
    `;
  }
  
  if (window.appState) {
    window.appState.reactError = {
      message: error.message,
      stack: error.stack
    };
  }
}

// Service worker registration temporarily disabled for debugging

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
