/**
 * Offline storage utility for TrashDrops app
 * Manages storing and retrieving data when the user is offline
 * Uses IndexedDB for persistent storage
 */

// Constants for IndexedDB
const DB_NAME = 'trashdrop_offline_db';
const DB_VERSION = 2; // Increment version for schema changes
const REPORTS_STORE = 'dumping_reports';
const LOCATIONS_STORE = 'saved_locations';
const SYNC_QUEUE_STORE = 'sync_queue';

/**
 * Initialize IndexedDB
 * @returns {Promise} - Promise resolving to the database instance
 */
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('Error opening IndexedDB:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      // Log available stores for debugging
      console.log('Available stores:', Array.from(db.objectStoreNames));
      resolve(db);
    };
    
    // Create object stores if they don't exist
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('Upgrading IndexedDB schema to version', DB_VERSION);
      
      if (!db.objectStoreNames.contains(REPORTS_STORE)) {
        console.log('Creating reports store');
        const reportStore = db.createObjectStore(REPORTS_STORE, { keyPath: 'id', autoIncrement: true });
        reportStore.createIndex('status', 'status', { unique: false });
        reportStore.createIndex('created_at', 'created_at', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(LOCATIONS_STORE)) {
        console.log('Creating locations store');
        const locationStore = db.createObjectStore(LOCATIONS_STORE, { keyPath: 'id' });
        locationStore.createIndex('user_id', 'user_id', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        console.log('Creating sync queue store');
        const syncQueueStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        syncQueueStore.createIndex('operation', 'operation', { unique: false });
        syncQueueStore.createIndex('storeName', 'storeName', { unique: false });
        syncQueueStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

/**
 * Save a dumping report to local storage when offline
 * @param {Object} report - Report object to save
 * @returns {Promise} - Promise resolving to the ID of the saved report
 */
export const saveOfflineReport = async (report) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([REPORTS_STORE], 'readwrite');
      const store = transaction.objectStore(REPORTS_STORE);
      
      // Add necessary metadata for reliable sync
      const reportToSave = {
        ...report,
        status: 'pending',
        created_at: report.created_at || new Date().toISOString(),
        synced: false,
        sync_attempts: 0,
        last_sync_attempt: null,
        offline_id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        device_id: localStorage.getItem('device_id') || `device_${Math.random().toString(36).substring(2, 15)}`,
      };
      
      // Store device ID if not already stored
      if (!localStorage.getItem('device_id')) {
        localStorage.setItem('device_id', reportToSave.device_id);
      }
      
      // Add to sync queue
      addToSyncQueue({
        operation: 'add',
        storeName: REPORTS_STORE,
        data: reportToSave,
        createdAt: new Date().toISOString()
      });
      
      const request = store.add(reportToSave);
      
      request.onsuccess = () => {
        console.log('Report saved offline successfully with ID:', request.result);
        
        // Update counts in localStorage for UI feedback
        const pendingCount = localStorage.getItem('pendingReportsCount') || '0';
        localStorage.setItem('pendingReportsCount', (parseInt(pendingCount, 10) + 1).toString());
        
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        console.error('Error saving report offline:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to save offline report:', error);
    throw error;
  }
};

/**
 * Add an operation to the sync queue
 * @param {Object} operation - Operation to add to the queue
 * @returns {Promise} - Promise resolving to the ID of the added operation
 */
export const addToSyncQueue = async (operation) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sync_queue'], 'readwrite');
      const store = transaction.objectStore('sync_queue');
      
      const request = store.add(operation);
      
      request.onsuccess = () => {
        console.log('Operation added to sync queue with ID:', request.result);
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        console.error('Error adding operation to sync queue:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to add operation to sync queue:', error);
    throw error;
  }
};

/**
 * Remove an operation from the sync queue
 * @param {number} id - ID of the operation to remove
 * @returns {Promise}
 */
export const removeFromSyncQueue = async (id) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sync_queue'], 'readwrite');
      const store = transaction.objectStore('sync_queue');
      
      const request = store.delete(id);
      
      request.onsuccess = () => {
        console.log('Operation removed from sync queue with ID:', id);
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('Error removing operation from sync queue:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to remove operation from sync queue:', error);
    throw error;
  }
};

/**
 * Get all pending reports that need to be synced
 * @returns {Promise} - Promise resolving to an array of pending reports
 */
export const getPendingReports = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([REPORTS_STORE], 'readonly');
      const store = transaction.objectStore(REPORTS_STORE);
      const index = store.index('status');
      
      const request = index.getAll('pending');
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to get pending reports:', error);
    throw error;
  }
};

/**
 * Mark a report as synced in the offline storage
 * @param {number} id - ID of the report to mark as synced
 * @returns {Promise}
 */
export const markReportSynced = async (id) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([REPORTS_STORE], 'readwrite');
      const store = transaction.objectStore(REPORTS_STORE);
      
      // First get the report
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const report = getRequest.result;
        if (report) {
          report.status = 'synced';
          report.synced = true;
          report.updated_at = new Date().toISOString();
          
          const updateRequest = store.put(report);
          
          updateRequest.onsuccess = () => {
            resolve(true);
          };
          
          updateRequest.onerror = (event) => {
            reject(event.target.error);
          };
        } else {
          reject(new Error(`Report with ID ${id} not found`));
        }
      };
      
      getRequest.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to mark report as synced:', error);
    throw error;
  }
};

/**
 * Delete a report from offline storage (after successful sync)
 * @param {number} id - ID of the report to delete
 * @returns {Promise}
 */
export const deleteOfflineReport = async (id) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([REPORTS_STORE], 'readwrite');
      const store = transaction.objectStore(REPORTS_STORE);
      
      const request = store.delete(id);
      
      request.onsuccess = () => {
        resolve(true);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to delete offline report:', error);
    throw error;
  }
};

/**
 * Save a location to offline storage
 * @param {Object} location - Location to save
 * @param {string} userId - User ID associated with the location
 * @returns {Promise}
 */
export const saveOfflineLocation = async (location, userId) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([LOCATIONS_STORE], 'readwrite');
      const store = transaction.objectStore(LOCATIONS_STORE);
      
      // Ensure the location has a user ID
      const locationToSave = {
        ...location,
        user_id: userId,
        created_at: new Date().toISOString()
      };
      
      const request = store.put(locationToSave);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to save offline location:', error);
    throw error;
  }
};

/**
 * Get all saved locations for a user from offline storage
 * @param {string} userId - User ID to get locations for
 * @returns {Promise} - Promise resolving to array of locations
 */
export const getOfflineLocations = async (userId) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([LOCATIONS_STORE], 'readonly');
      const store = transaction.objectStore(LOCATIONS_STORE);
      const index = store.index('user_id');
      
      const request = index.getAll(userId);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to get offline locations:', error);
    throw error;
  }
};

/**
 * Check if the browser is online
 * @returns {boolean} - Whether the browser is online
 */
export const isOnline = () => {
  return navigator.onLine;
};

export default {
  saveOfflineReport,
  getPendingReports,
  markReportSynced,
  deleteOfflineReport,
  saveOfflineLocation,
  getOfflineLocations,
  isOnline
};
