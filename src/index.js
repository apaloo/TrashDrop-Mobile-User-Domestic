import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.js";
import ErrorBoundary from "./components/ErrorBoundary";
import performanceTracker from "./utils/performanceTracker";
import reportWebVitals from "./reportWebVitals";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";
import * as mobileServiceWorker from "./mobileServiceWorker";
import { initGlobalErrorHandlers } from "./utils/errorBoundary";
import { isMobileDevice } from "./utils/mobileAuth";

// Initialize global error handlers early
initGlobalErrorHandlers();

// Make performance tracker available for splash screen
if (typeof window \!== "undefined") {
  window.performanceTracker = performanceTracker;
  
  // Start tracking splash screen if it is visible
  if (document.getElementById("splash-screen")) {
    performanceTracker.trackStartup.splashScreen();
  }
}

// Debug initialization tracking
function logAppDebug(message, data) {
  if (window.debugReport) {
    window.debugReport("React: " + message, data);
  } else {
    console.log("[React Debug]", message, data || "");
  }
}

// Track initial React render
logAppDebug("React initialization starting");

// Initialize the app - REGISTER service worker
// Use mobile-specific service worker for mobile devices
if (isMobileDevice()) {
  console.log("[PWA] Mobile device detected, using mobile-specific service worker");
  mobileServiceWorker.register({
    onUpdate: registration => {
      console.log('[PWA] New content is available, please refresh');
    },
    onSuccess: registration => {
      console.log('[PWA] Content is cached for offline use');
    }
  });
} else {
  console.log("[PWA] Desktop device detected, using standard service worker");
  serviceWorkerRegistration.register({
    onUpdate: registration => {
      console.log('[PWA] New content is available, please refresh');
    },
    onSuccess: registration => {
      console.log('[PWA] Content is cached for offline use');
    }
  });
}

// Using the ErrorBoundary component imported from ./components/ErrorBoundary

// Error handling for React initialization
try {
  logAppDebug("Creating React root");
  const rootElement = document.getElementById("root");
  
  if (\!rootElement) {
    throw new Error("Root element #root not found in DOM");
  }
  
  const root = ReactDOM.createRoot(rootElement);
  
  // Track React states
  if (window.appState) {
    window.appState.reactRootCreated = true;
  }
  
  logAppDebug("Rendering React application");
  
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
  
  logAppDebug("React render complete");
  
  // Track successful render
  if (window.appState) {
    window.appState.reactRendered = true;
  }
  
} catch (error) {
  logAppDebug("React initialization failed", {
    errorMessage: error.message,
    stack: error.stack
  });
  
  // Display error in DOM
  const rootElement = document.getElementById("root");
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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
