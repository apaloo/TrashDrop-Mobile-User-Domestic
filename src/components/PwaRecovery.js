import React, { useEffect } from "react";
import { isPwaMode } from "../utils/pwaHelpers";

/**
 * Component that provides recovery mechanisms for PWA blank screens
 * This is a last resort to prevent completely blank screens
 */
const PwaRecovery = () => {
  useEffect(() => {
    // Only run in PWA mode
    if (\!isPwaMode()) return;
    
    console.log("[PwaRecovery] Initializing PWA recovery mechanisms");
    
    // Create a visible element that will persist even if React fails
    const createRecoveryElement = () => {
      // Check if recovery element already exists
      if (document.getElementById('pwa-recovery-element')) return;
      
      const recoveryElement = document.createElement('div');
      recoveryElement.id = 'pwa-recovery-element';
      recoveryElement.style.display = 'none';
      
      // Add a recovery button that will appear if the screen goes blank
      const recoveryButton = document.createElement('button');
      recoveryButton.textContent = 'Recover App';
      recoveryButton.style.position = 'fixed';
      recoveryButton.style.bottom = '20px';
      recoveryButton.style.left = '50%';
      recoveryButton.style.transform = 'translateX(-50%)';
      recoveryButton.style.padding = '10px 20px';
      recoveryButton.style.backgroundColor = '#4CAF50';
      recoveryButton.style.color = 'white';
      recoveryButton.style.border = 'none';
      recoveryButton.style.borderRadius = '4px';
      recoveryButton.style.fontSize = '16px';
      recoveryButton.style.zIndex = '10000';
      recoveryButton.style.display = 'none';
      
      recoveryButton.addEventListener('click', () => {
        // Clear potentially problematic storage
        try {
          localStorage.removeItem('trashdrop_last_path');
          sessionStorage.removeItem('trashdrop_last_path');
        } catch (e) {
          console.error('[PwaRecovery] Error clearing storage:', e);
        }
        
        // Force reload to root
        window.location.href = '/';
      });
      
      recoveryElement.appendChild(recoveryButton);
      document.body.appendChild(recoveryElement);
      
      // Set up a MutationObserver to detect when the screen might be blank
      const observer = new MutationObserver((mutations) => {
        // Check if main content is empty or removed
        const mainContent = document.querySelector('main') || 
                            document.querySelector('.app-content') || 
                            document.querySelector('#root > div');
        
        if (\!mainContent || mainContent.children.length === 0) {
          console.log('[PwaRecovery] Potential blank screen detected, showing recovery button');
          recoveryButton.style.display = 'block';
        } else {
          recoveryButton.style.display = 'none';
        }
      });
      
      // Start observing
      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: false,
        characterData: false
      });
      
      return () => {
        observer.disconnect();
        if (recoveryElement && recoveryElement.parentNode) {
          recoveryElement.parentNode.removeChild(recoveryElement);
        }
      };
    };
    
    // Create recovery element
    createRecoveryElement();
    
    // Set up a heartbeat to ensure the app is still responsive
    const heartbeatInterval = setInterval(() => {
      const timestamp = new Date().toISOString();
      try {
        localStorage.setItem('trashdrop_pwa_heartbeat', timestamp);
      } catch (e) {
        console.error('[PwaRecovery] Error setting heartbeat:', e);
      }
    }, 5000);
    
    return () => {
      clearInterval(heartbeatInterval);
    };
  }, []);
  
  return null; // This component doesn't render anything
};

export default PwaRecovery;
