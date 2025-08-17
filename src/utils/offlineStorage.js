/**
 * Offline storage utility for TrashDrops app
 * Manages storing and retrieving data when the user is offline
 * Uses IndexedDB for persistent storage
 */

// Constants for IndexedDB
const DB_NAME = 'trashdrop_offline_db';
const DB_VERSION = 4; // Incremented for new stores: batches, bags, batch_count
const REPORTS_STORE = 'dumping_reports';
const LOCATIONS_STORE = 'saved_locations';
const SYNC_QUEUE_STORE = 'sync_queue';
const USER_STATS_STORE = 'user_stats';
const USER_ACTIVITY_STORE = 'user_activity';
const BATCHES_STORE = 'batches';
const BAGS_STORE = 'bags';
const BATCH_COUNT_STORE = 'batch_count';

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
      
      if (!db.objectStoreNames.contains(USER_STATS_STORE)) {
        console.log('Creating user stats store');
        const userStatsStore = db.createObjectStore(USER_STATS_STORE, { keyPath: 'user_id' });
        userStatsStore.createIndex('last_updated', 'last_updated', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(USER_ACTIVITY_STORE)) {
        console.log('Creating user activity store');
        const userActivityStore = db.createObjectStore(USER_ACTIVITY_STORE, { keyPath: 'id', autoIncrement: true });
        userActivityStore.createIndex('user_id', 'user_id', { unique: false });
        userActivityStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Mirror remote schema tables used by Scan QR for offline parity
      if (!db.objectStoreNames.contains(BATCHES_STORE)) {
        console.log('Creating batches store');
        const batchesStore = db.createObjectStore(BATCHES_STORE, { keyPath: 'id' });
        batchesStore.createIndex('batch_number', 'batch_number', { unique: false });
        batchesStore.createIndex('status', 'status', { unique: false });
        batchesStore.createIndex('created_by', 'created_by', { unique: false });
      }

      if (!db.objectStoreNames.contains(BAGS_STORE)) {
        console.log('Creating bags store');
        const bagsStore = db.createObjectStore(BAGS_STORE, { keyPath: 'id' });
        bagsStore.createIndex('batch_id', 'batch_id', { unique: false });
        bagsStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(BATCH_COUNT_STORE)) {
        console.log('Creating batch_count store');
        db.createObjectStore(BATCH_COUNT_STORE, { keyPath: 'id' });
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

// -----------------------
// Batch/bags cache helpers
// -----------------------

export const cacheBatch = async (batch) => {
  if (!batch || !batch.id) return null;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BATCHES_STORE], 'readwrite');
    const store = tx.objectStore(BATCHES_STORE);
    const req = store.put(batch);
    req.onsuccess = () => resolve(batch);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const getCachedBatchById = async (id) => {
  if (!id) return null;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BATCHES_STORE], 'readonly');
    const store = tx.objectStore(BATCHES_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const getCachedBatchByNumber = async (batchNumber) => {
  if (!batchNumber) return null;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BATCHES_STORE], 'readonly');
    const store = tx.objectStore(BATCHES_STORE);
    const index = store.index('batch_number');
    const req = index.get(batchNumber);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const cacheBags = async (batchId, bags) => {
  if (!batchId || !Array.isArray(bags)) return 0;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BAGS_STORE], 'readwrite');
    const store = tx.objectStore(BAGS_STORE);
    let count = 0;
    const onComplete = () => resolve(count);
    tx.oncomplete = onComplete;
    tx.onerror = (e) => reject(e.target.error);
    bags.forEach((bag) => {
      try {
        store.put({ ...bag, batch_id: bag.batch_id || batchId });
        count += 1;
      } catch (_) {}
    });
  });
};

export const getCachedBags = async (batchId) => {
  if (!batchId) return [];
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BAGS_STORE], 'readonly');
    const store = tx.objectStore(BAGS_STORE);
    const index = store.index('batch_id');
    const req = index.getAll(batchId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const cacheBatchCount = async (row) => {
  if (!row || !row.id) return null; // row like { id: 'singleton', count: N }
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BATCH_COUNT_STORE], 'readwrite');
    const store = tx.objectStore(BATCH_COUNT_STORE);
    const req = store.put(row);
    req.onsuccess = () => resolve(row);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const getCachedBatchCount = async (id = 'singleton') => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BATCH_COUNT_STORE], 'readonly');
    const store = tx.objectStore(BATCH_COUNT_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
};

/**
 * Cache user stats for offline access
 * @param {string} userId - User ID
 * @param {Object} stats - User stats object
 * @returns {Promise} - Promise resolving when stats are cached
 */
export const cacheUserStats = async (userId, stats) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([USER_STATS_STORE], 'readwrite');
      const store = transaction.objectStore(USER_STATS_STORE);
      
      const statsToSave = {
        user_id: userId,
        ...stats,
        last_updated: new Date().toISOString(),
        cached_at: Date.now()
      };
      
      const request = store.put(statsToSave);
      
      request.onsuccess = () => {
        console.log('User stats cached successfully for user:', userId);
        resolve(statsToSave);
      };
      
      request.onerror = (event) => {
        console.error('Error caching user stats:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to cache user stats:', error);
    throw error;
  }
};

/**
 * Get cached user stats
 * @param {string} userId - User ID
 * @returns {Promise} - Promise resolving to cached stats or null
 */
export const getCachedUserStats = async (userId) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([USER_STATS_STORE], 'readonly');
      const store = transaction.objectStore(USER_STATS_STORE);
      
      const request = store.get(userId);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Check if cache is still valid (24 hours)
          const cacheAge = Date.now() - result.cached_at;
          const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
          
          if (cacheAge < maxCacheAge) {
            console.log('Retrieved cached user stats for user:', userId);
            resolve(result);
          } else {
            console.log('Cached user stats expired for user:', userId);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      
      request.onerror = (event) => {
        console.error('Error retrieving cached user stats:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to get cached user stats:', error);
    return null;
  }
};

/**
 * Cache user activity for offline access
 * @param {string} userId - User ID
 * @param {Array} activities - Array of activity objects
 * @returns {Promise} - Promise resolving when activities are cached
 */
export const cacheUserActivity = async (userId, activities) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([USER_ACTIVITY_STORE], 'readwrite');
      const store = transaction.objectStore(USER_ACTIVITY_STORE);
      
      // Clear existing activities for this user first
      const userIndex = store.index('user_id');
      const deleteRequest = userIndex.openCursor(IDBKeyRange.only(userId));
      
      deleteRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          // Now add new activities
          const promises = activities.map(activity => {
            const activityToSave = {
              ...activity,
              user_id: userId,
              cached_at: Date.now()
            };
            return store.add(activityToSave);
          });
          
          Promise.all(promises).then(() => {
            console.log('User activities cached successfully for user:', userId);
            resolve();
          }).catch(reject);
        }
      };
      
      deleteRequest.onerror = (event) => {
        console.error('Error caching user activities:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to cache user activities:', error);
    throw error;
  }
};

/**
 * Get cached user activities
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of activities to return
 * @returns {Promise} - Promise resolving to cached activities
 */
export const getCachedUserActivity = async (userId, limit = 10) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([USER_ACTIVITY_STORE], 'readonly');
      const store = transaction.objectStore(USER_ACTIVITY_STORE);
      const userIndex = store.index('user_id');
      
      const activities = [];
      const request = userIndex.openCursor(IDBKeyRange.only(userId));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && activities.length < limit) {
          const activity = cursor.value;
          // Check if cache is still valid (24 hours)
          const cacheAge = Date.now() - activity.cached_at;
          const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
          
          if (cacheAge < maxCacheAge) {
            activities.push(activity);
          }
          cursor.continue();
        } else {
          // Sort by created_at descending
          activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          console.log(`Retrieved ${activities.length} cached activities for user:`, userId);
          resolve(activities);
        }
      };
      
      request.onerror = (event) => {
        console.error('Error retrieving cached user activities:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to get cached user activities:', error);
    return [];
  }
};

const offlineStorageAPI = {
  saveOfflineReport,
  getPendingReports,
  markReportSynced,
  deleteOfflineReport,
  saveOfflineLocation,
  getOfflineLocations,
  isOnline,
  cacheUserStats,
  getCachedUserStats,
  cacheUserActivity,
  getCachedUserActivity,
  cacheBatch,
  getCachedBatchById,
  getCachedBatchByNumber,
  cacheBags,
  getCachedBags,
  cacheBatchCount,
  getCachedBatchCount
};

export default offlineStorageAPI;
