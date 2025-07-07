import { openDB } from 'idb';
import appConfig from './app-config';

/**
 * IndexedDB utility for offline data persistence
 */
const dbPromise = openDB('trashdrop-db', 1, {
  upgrade(db) {
    // Create object stores for different data types
    
    // Pickups store
    if (!db.objectStoreNames.contains('pickups')) {
      const pickupsStore = db.createObjectStore('pickups', { keyPath: 'id', autoIncrement: true });
      pickupsStore.createIndex('userId', 'userId', { unique: false });
      pickupsStore.createIndex('status', 'status', { unique: false });
      pickupsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
      pickupsStore.createIndex('createdAt', 'createdAt', { unique: false });
    }
    
    // Reports store
    if (!db.objectStoreNames.contains('reports')) {
      const reportsStore = db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
      reportsStore.createIndex('userId', 'userId', { unique: false });
      reportsStore.createIndex('status', 'status', { unique: false });
      reportsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
      reportsStore.createIndex('createdAt', 'createdAt', { unique: false });
    }
    
    // QR scans store
    if (!db.objectStoreNames.contains('qrScans')) {
      const qrScansStore = db.createObjectStore('qrScans', { keyPath: 'id', autoIncrement: true });
      qrScansStore.createIndex('userId', 'userId', { unique: false });
      qrScansStore.createIndex('binId', 'binId', { unique: false });
      qrScansStore.createIndex('syncStatus', 'syncStatus', { unique: false });
      qrScansStore.createIndex('timestamp', 'timestamp', { unique: false });
    }
    
    // User activity store
    if (!db.objectStoreNames.contains('activities')) {
      const activitiesStore = db.createObjectStore('activities', { keyPath: 'id', autoIncrement: true });
      activitiesStore.createIndex('userId', 'userId', { unique: false });
      activitiesStore.createIndex('type', 'type', { unique: false });
      activitiesStore.createIndex('date', 'date', { unique: false });
    }
    
    // User rewards store
    if (!db.objectStoreNames.contains('rewards')) {
      const rewardsStore = db.createObjectStore('rewards', { keyPath: 'id' });
      rewardsStore.createIndex('pointsCost', 'pointsCost', { unique: false });
      rewardsStore.createIndex('expiresAt', 'expiresAt', { unique: false });
    }
    
    // User points store
    if (!db.objectStoreNames.contains('userPoints')) {
      db.createObjectStore('userPoints', { keyPath: 'userId' });
    }
    
    // Sync queue for operations that failed while offline
    if (!db.objectStoreNames.contains('syncQueue')) {
      const syncQueueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      syncQueueStore.createIndex('operation', 'operation', { unique: false });
      syncQueueStore.createIndex('createdAt', 'createdAt', { unique: false });
      syncQueueStore.createIndex('status', 'status', { unique: false });
    }
    
    // App settings store
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'key' });
    }
  },
});

/**
 * Generic IndexedDB CRUD operations
 */
const idbUtils = {
  /**
   * Add a record to the specified store
   * @param {string} storeName - Name of the object store
   * @param {Object} data - Data to add
   * @returns {Promise<number>} - ID of the added record
   */
  async add(storeName, data) {
    try {
      const db = await dbPromise;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      // Add syncStatus for syncable stores
      if (['pickups', 'reports', 'qrScans'].includes(storeName)) {
        data.syncStatus = navigator.onLine ? 'synced' : 'pending';
      }
      
      // Add timestamp if not present
      if (!data.createdAt) {
        data.createdAt = new Date().toISOString();
      }
      
      const id = await store.add(data);
      await tx.complete;
      
      // If offline, add to sync queue
      if (!navigator.onLine && ['pickups', 'reports', 'qrScans'].includes(storeName)) {
        await this.addToSyncQueue({
          operation: 'add',
          storeName,
          data,
          status: 'pending'
        });
      }
      
      return id;
    } catch (error) {
      console.error(`Error adding to ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Get all records from the specified store
   * @param {string} storeName - Name of the object store
   * @returns {Promise<Array>} - Array of records
   */
  async getAll(storeName) {
    try {
      const db = await dbPromise;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return await store.getAll();
    } catch (error) {
      console.error(`Error getting all from ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Get a record by ID from the specified store
   * @param {string} storeName - Name of the object store
   * @param {string|number} id - ID of the record to get
   * @returns {Promise<Object|undefined>} - Record or undefined if not found
   */
  async get(storeName, id) {
    try {
      const db = await dbPromise;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return await store.get(id);
    } catch (error) {
      console.error(`Error getting from ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Update a record in the specified store
   * @param {string} storeName - Name of the object store
   * @param {Object} data - Data to update (must include key)
   * @returns {Promise<undefined>}
   */
  async update(storeName, data) {
    try {
      const db = await dbPromise;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      // If offline and syncable store, mark as pending sync
      if (!navigator.onLine && ['pickups', 'reports', 'qrScans'].includes(storeName)) {
        data.syncStatus = 'pending';
        
        // Add to sync queue
        await this.addToSyncQueue({
          operation: 'update',
          storeName,
          data,
          status: 'pending'
        });
      }
      
      await store.put(data);
      await tx.complete;
    } catch (error) {
      console.error(`Error updating in ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Delete a record from the specified store
   * @param {string} storeName - Name of the object store
   * @param {string|number} id - ID of the record to delete
   * @returns {Promise<undefined>}
   */
  async delete(storeName, id) {
    try {
      const db = await dbPromise;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      // If offline and syncable store, add to sync queue
      if (!navigator.onLine && ['pickups', 'reports', 'qrScans'].includes(storeName)) {
        const data = await store.get(id);
        if (data) {
          await this.addToSyncQueue({
            operation: 'delete',
            storeName,
            data: { id },
            status: 'pending'
          });
        }
      }
      
      await store.delete(id);
      await tx.complete;
    } catch (error) {
      console.error(`Error deleting from ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Clear all records from the specified store
   * @param {string} storeName - Name of the object store
   * @returns {Promise<undefined>}
   */
  async clear(storeName) {
    try {
      const db = await dbPromise;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await store.clear();
      await tx.complete;
    } catch (error) {
      console.error(`Error clearing ${storeName}:`, error);
      throw error;
    }
  },
  
  /**
   * Query records using an index
   * @param {string} storeName - Name of the object store
   * @param {string} indexName - Name of the index to use
   * @param {*} value - Value to query for
   * @returns {Promise<Array>} - Array of matching records
   */
  async getByIndex(storeName, indexName, value) {
    try {
      const db = await dbPromise;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      return await index.getAll(value);
    } catch (error) {
      console.error(`Error querying ${storeName} by ${indexName}:`, error);
      throw error;
    }
  },
  
  /**
   * Add an operation to the sync queue
   * @param {Object} operation - Operation details
   * @returns {Promise<number>} - ID of the queued operation
   */
  async addToSyncQueue(operation) {
    try {
      const db = await dbPromise;
      const tx = db.transaction('syncQueue', 'readwrite');
      const store = tx.objectStore('syncQueue');
      
      operation.createdAt = new Date().toISOString();
      const id = await store.add(operation);
      await tx.complete;
      return id;
    } catch (error) {
      console.error('Error adding to sync queue:', error);
      throw error;
    }
  },
  
  /**
   * Get all pending operations from the sync queue
   * @returns {Promise<Array>} - Array of pending operations
   */
  async getPendingSyncOperations() {
    try {
      const db = await dbPromise;
      const tx = db.transaction('syncQueue', 'readonly');
      const store = tx.objectStore('syncQueue');
      const index = store.index('status');
      return await index.getAll('pending');
    } catch (error) {
      console.error('Error getting pending sync operations:', error);
      throw error;
    }
  },
  
  /**
   * Update the status of an operation in the sync queue
   * @param {number} id - ID of the operation
   * @param {string} status - New status ('synced', 'failed')
   * @returns {Promise<undefined>}
   */
  async updateSyncOperationStatus(id, status) {
    try {
      const db = await dbPromise;
      const tx = db.transaction('syncQueue', 'readwrite');
      const store = tx.objectStore('syncQueue');
      
      const operation = await store.get(id);
      if (operation) {
        operation.status = status;
        operation.lastAttempt = new Date().toISOString();
        await store.put(operation);
      }
      
      await tx.complete;
    } catch (error) {
      console.error('Error updating sync operation status:', error);
      throw error;
    }
  },
  
  /**
   * Get user points
   * @param {string} userId - User ID
   * @returns {Promise<number>} - User's points
   */
  async getUserPoints(userId) {
    try {
      const pointsData = await this.get('userPoints', userId);
      return pointsData ? pointsData.points : 0;
    } catch (error) {
      console.error('Error getting user points:', error);
      throw error;
    }
  },
  
  /**
   * Update user points
   * @param {string} userId - User ID
   * @param {number} points - New points total
   * @returns {Promise<undefined>}
   */
  async updateUserPoints(userId, points) {
    try {
      await this.update('userPoints', { userId, points });
      
      // Add to activities if it's a change
      const currentPoints = await this.getUserPoints(userId);
      if (points !== currentPoints) {
        const difference = points - currentPoints;
        
        await this.add('activities', {
          userId,
          type: difference > 0 ? 'points_earned' : 'points_spent',
          points: difference,
          date: new Date().toISOString(),
          description: difference > 0 ? 'Points earned' : 'Points spent'
        });
      }
    } catch (error) {
      console.error('Error updating user points:', error);
      throw error;
    }
  },
  
  /**
   * Add points to user's total
   * @param {string} userId - User ID
   * @param {number} pointsToAdd - Points to add (positive or negative)
   * @returns {Promise<number>} - New total points
   */
  async addPoints(userId, pointsToAdd) {
    try {
      const currentPoints = await this.getUserPoints(userId);
      const newTotal = currentPoints + pointsToAdd;
      await this.updateUserPoints(userId, newTotal);
      return newTotal;
    } catch (error) {
      console.error('Error adding points:', error);
      throw error;
    }
  }
};

export default idbUtils;
