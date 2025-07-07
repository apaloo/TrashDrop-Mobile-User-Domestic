import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import syncService from './utils/syncService';

// Import auth tester for development testing
import * as authTester from './utils/authTester';

// Initialize sync service
const initializeApp = () => {
  // This will set up offline sync listeners
  syncService.initialize();

  // Listen for service worker messages
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SYNC_DATA') {
        console.log('Received sync request from service worker');
        syncService.syncData();
      }
    });
  }
};

// Initialize the app
initializeApp();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Register the service worker with custom configuration
serviceWorkerRegistration.register({
  onSuccess: (registration) => {
    console.log('Service worker registration successful');
    
    // Request sync permission if available
    if ('SyncManager' in window) {
      registration.sync.register('sync-data')
        .then(() => console.log('Background sync registered'))
        .catch(err => console.error('Background sync registration failed:', err));
    }
  },
  onUpdate: (registration) => {
    console.log('New version available! Ready to update.');
    
    // Add notification for the user about the update
    const updateNotification = document.createElement('div');
    updateNotification.className = 'fixed bottom-0 left-0 right-0 bg-primary text-white p-4 text-center';
    updateNotification.innerHTML = `
      <div class="container mx-auto flex items-center justify-between">
        <p>A new version of TrashDrop is available!</p>
        <button id="update-app" class="px-4 py-1 bg-white text-primary rounded-md">
          Update now
        </button>
      </div>
    `;
    
    document.body.appendChild(updateNotification);
    
    document.getElementById('update-app').addEventListener('click', () => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    });
  }
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
