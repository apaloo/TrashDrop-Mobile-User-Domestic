import idbUtils from './indexedDB';
import { supabase } from './supabaseClient';

/**
 * Service to handle synchronization of data between IndexedDB and backend
 */
class SyncService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
  }
  
  /**
   * Initialize the sync service
   * @returns {void}
   */
  initialize() {
    console.log('Initializing sync service...');
    this.registerListeners();
    // Check for pending sync operations immediately
    if (this.isOnline) {
      this.syncData();
    }
  }

  /**
   * Register online/offline event listeners
   */
  registerListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('App is online. Starting sync...');
      this.syncData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('App is offline. Data will be synced when connection is restored.');
    });

    // If Service Worker is supported, register for sync events
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.sync.register('sync-data')
          .then(() => console.log('Background sync registered'))
          .catch(err => console.error('Background sync registration failed:', err));
      });
    }
  }

  /**
   * Main function to sync all pending data
   */
  async syncData() {
    if (!this.isOnline || this.isSyncing) return;

    try {
      this.isSyncing = true;
      console.log('Starting data synchronization...');

      // Get all pending operations from the sync queue
      const pendingOperations = await idbUtils.getPendingSyncOperations();
      console.log(`Found ${pendingOperations.length} pending operations`);

      // Process each operation in order of creation
      for (const operation of pendingOperations.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt))) {
        await this.processSyncOperation(operation);
      }

      console.log('Synchronization complete');
    } catch (error) {
      console.error('Error during synchronization:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process a single sync operation
   * @param {Object} operation - Operation to process
   */
  async processSyncOperation(operation) {
    console.log(`Processing operation: ${operation.operation} on ${operation.storeName}`);
    
    try {
      let result;
      
      switch (operation.storeName) {
        case 'pickups':
          result = await this.syncPickup(operation);
          break;
        case 'reports':
          result = await this.syncReport(operation);
          break;
        case 'qrScans':
          result = await this.syncQRScan(operation);
          break;
        default:
          console.warn(`Unsupported store for sync: ${operation.storeName}`);
          return;
      }
      
      if (result.success) {
        // Update the sync status in the original store
        if (operation.operation !== 'delete') {
          const dataInStore = await idbUtils.get(operation.storeName, operation.data.id);
          if (dataInStore) {
            dataInStore.syncStatus = 'synced';
            // If the server assigned a different ID, update the local record
            if (result.serverId) {
              dataInStore.serverId = result.serverId;
            }
            await idbUtils.update(operation.storeName, dataInStore);
          }
        }
        
        // Mark operation as synced
        await idbUtils.updateSyncOperationStatus(operation.id, 'synced');
      } else {
        console.error(`Sync failed for operation ${operation.id}:`, result.error);
        await idbUtils.updateSyncOperationStatus(operation.id, 'failed');
      }
    } catch (error) {
      console.error(`Error processing sync operation ${operation.id}:`, error);
      await idbUtils.updateSyncOperationStatus(operation.id, 'failed');
    }
  }

  /**
   * Sync a pickup operation with the backend
   * @param {Object} operation - Operation details
   * @returns {Object} - Result of the operation
   */
  async syncPickup(operation) {
    try {
      switch (operation.operation) {
        case 'add': {
          // Format data for API
          const apiData = {
            user_id: operation.data.userId,
            waste_type: operation.data.wasteType,
            location: operation.data.location,
            pickup_date: operation.data.pickupDate,
            pickup_time: operation.data.pickupTime,
            notes: operation.data.notes,
            status: operation.data.status
          };
          
          // Call API
          const { data, error } = await supabase
            .from('pickups')
            .insert(apiData)
            .select('id')
            .single();
            
          if (error) throw error;
          
          return { success: true, serverId: data.id };
        }
        
        case 'update': {
          // Get server ID if available, otherwise use local ID
          const id = operation.data.serverId || operation.data.id;
          
          // Format data for API
          const apiData = {
            waste_type: operation.data.wasteType,
            location: operation.data.location,
            pickup_date: operation.data.pickupDate,
            pickup_time: operation.data.pickupTime,
            notes: operation.data.notes,
            status: operation.data.status,
            updated_at: new Date().toISOString()
          };
          
          // Call API
          const { error } = await supabase
            .from('pickups')
            .update(apiData)
            .eq('id', id);
            
          if (error) throw error;
          
          return { success: true };
        }
        
        case 'delete': {
          // Get server ID if available, otherwise use local ID
          const id = operation.data.serverId || operation.data.id;
          
          // Call API
          const { error } = await supabase
            .from('pickups')
            .delete()
            .eq('id', id);
            
          if (error) throw error;
          
          return { success: true };
        }
        
        default:
          return { success: false, error: 'Unsupported operation' };
      }
    } catch (error) {
      console.error('Error syncing pickup:', error);
      return { success: false, error };
    }
  }

  /**
   * Sync a report operation with the backend
   * @param {Object} operation - Operation details
   * @returns {Object} - Result of the operation
   */
  async syncReport(operation) {
    try {
      switch (operation.operation) {
        case 'add': {
          // Format data for API
          const apiData = {
            user_id: operation.data.userId,
            waste_type: operation.data.wasteType,
            severity: operation.data.severity,
            description: operation.data.description,
            location: operation.data.location,
            images: operation.data.images || [],
            status: operation.data.status
          };
          
          // Call API
          const { data, error } = await supabase
            .from('reports')
            .insert(apiData)
            .select('id')
            .single();
            
          if (error) throw error;
          
          return { success: true, serverId: data.id };
        }
        
        case 'update': {
          // Get server ID if available, otherwise use local ID
          const id = operation.data.serverId || operation.data.id;
          
          // Format data for API
          const apiData = {
            waste_type: operation.data.wasteType,
            severity: operation.data.severity,
            description: operation.data.description,
            location: operation.data.location,
            images: operation.data.images || [],
            status: operation.data.status,
            updated_at: new Date().toISOString()
          };
          
          // Call API
          const { error } = await supabase
            .from('reports')
            .update(apiData)
            .eq('id', id);
            
          if (error) throw error;
          
          return { success: true };
        }
        
        case 'delete': {
          // Get server ID if available, otherwise use local ID
          const id = operation.data.serverId || operation.data.id;
          
          // Call API
          const { error } = await supabase
            .from('reports')
            .delete()
            .eq('id', id);
            
          if (error) throw error;
          
          return { success: true };
        }
        
        default:
          return { success: false, error: 'Unsupported operation' };
      }
    } catch (error) {
      console.error('Error syncing report:', error);
      return { success: false, error };
    }
  }

  /**
   * Sync a QR scan operation with the backend
   * @param {Object} operation - Operation details
   * @returns {Object} - Result of the operation
   */
  async syncQRScan(operation) {
    try {
      switch (operation.operation) {
        case 'add': {
          // Format data for API
          const apiData = {
            user_id: operation.data.userId,
            bin_id: operation.data.binId,
            scan_time: operation.data.timestamp || new Date().toISOString(),
            location: operation.data.location
          };
          
          // Call API
          const { data, error } = await supabase
            .from('qr_scans')
            .insert(apiData)
            .select('id')
            .single();
            
          if (error) throw error;
          
          // If points were awarded, sync that too
          if (operation.data.points) {
            const { error: pointsError } = await supabase
              .from('user_points')
              .upsert({
                user_id: operation.data.userId,
                points: operation.data.points,
                last_activity: new Date().toISOString()
              });
              
            if (pointsError) console.warn('Error syncing points:', pointsError);
          }
          
          return { success: true, serverId: data.id };
        }
        
        case 'update':
          // QR scans generally shouldn't be updated, but implement if needed
          return { success: false, error: 'QR scan updates not supported' };
        
        case 'delete': {
          // Get server ID if available, otherwise use local ID
          const id = operation.data.serverId || operation.data.id;
          
          // Call API
          const { error } = await supabase
            .from('qr_scans')
            .delete()
            .eq('id', id);
            
          if (error) throw error;
          
          return { success: true };
        }
        
        default:
          return { success: false, error: 'Unsupported operation' };
      }
    } catch (error) {
      console.error('Error syncing QR scan:', error);
      return { success: false, error };
    }
  }

  /**
   * Manually trigger a sync
   */
  manualSync() {
    if (this.isOnline) {
      this.syncData();
      return { success: true, message: 'Synchronization started' };
    } else {
      return { success: false, message: 'Cannot sync while offline' };
    }
  }

  /**
   * Check sync status
   */
  async getSyncStatus() {
    const pendingOperations = await idbUtils.getPendingSyncOperations();
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingOperationsCount: pendingOperations.length
    };
  }

  /**
   * Update local data from server
   */
  async pullFromServer(userId) {
    if (!this.isOnline) {
      return { success: false, message: 'Cannot pull data while offline' };
    }

    try {
      // Fetch user's pickups
      const { data: pickups, error: pickupsError } = await supabase
        .from('pickups')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (pickupsError) throw pickupsError;

      // Fetch user's reports
      const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (reportsError) throw reportsError;

      // Fetch user's QR scans
      const { data: qrScans, error: qrScansError } = await supabase
        .from('qr_scans')
        .select('*')
        .eq('user_id', userId)
        .order('scan_time', { ascending: false });

      if (qrScansError) throw qrScansError;

      // Fetch user's points
      const { data: pointsData, error: pointsError } = await supabase
        .from('user_points')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (pointsError && pointsError.code !== 'PGRST116') throw pointsError;

      // Update local storage
      // For pickups, merge with local data
      const localPickups = await idbUtils.getByIndex('pickups', 'userId', userId);
      const mergedPickups = this.mergeData(pickups, localPickups, 'id', 'serverId');
      
      // Clear existing pickups and save merged data
      await idbUtils.clear('pickups');
      for (const pickup of mergedPickups) {
        // Format for local storage
        const localPickup = {
          id: pickup.id,
          userId: pickup.user_id,
          serverId: pickup.id,
          wasteType: pickup.waste_type,
          location: pickup.location,
          pickupDate: pickup.pickup_date,
          pickupTime: pickup.pickup_time,
          notes: pickup.notes,
          status: pickup.status,
          syncStatus: 'synced',
          createdAt: pickup.created_at
        };
        await idbUtils.add('pickups', localPickup);
      }

      // Similar process for reports
      const localReports = await idbUtils.getByIndex('reports', 'userId', userId);
      const mergedReports = this.mergeData(reports, localReports, 'id', 'serverId');
      
      await idbUtils.clear('reports');
      for (const report of mergedReports) {
        const localReport = {
          id: report.id,
          userId: report.user_id,
          serverId: report.id,
          wasteType: report.waste_type,
          severity: report.severity,
          description: report.description,
          location: report.location,
          images: report.images || [],
          status: report.status,
          syncStatus: 'synced',
          createdAt: report.created_at
        };
        await idbUtils.add('reports', localReport);
      }

      // Similar process for QR scans
      const localQRScans = await idbUtils.getByIndex('qrScans', 'userId', userId);
      const mergedQRScans = this.mergeData(qrScans, localQRScans, 'id', 'serverId');
      
      await idbUtils.clear('qrScans');
      for (const scan of mergedQRScans) {
        const localScan = {
          id: scan.id,
          userId: scan.user_id,
          serverId: scan.id,
          binId: scan.bin_id,
          location: scan.location,
          timestamp: scan.scan_time,
          syncStatus: 'synced'
        };
        await idbUtils.add('qrScans', localScan);
      }

      // Update user points
      if (pointsData) {
        await idbUtils.update('userPoints', {
          userId,
          points: pointsData.points,
          lastUpdated: new Date().toISOString()
        });
      }

      return {
        success: true,
        message: 'Data successfully pulled from server',
        stats: {
          pickups: mergedPickups.length,
          reports: mergedReports.length,
          qrScans: mergedQRScans.length
        }
      };
    } catch (error) {
      console.error('Error pulling data from server:', error);
      return { success: false, message: 'Failed to pull data from server', error };
    }
  }

  /**
   * Merge local and server data, prioritizing local unsynchronized changes
   * @param {Array} serverData - Data from the server
   * @param {Array} localData - Data from IndexedDB
   * @param {string} serverIdKey - Key for server ID
   * @param {string} localServerIdKey - Key for server ID in local data
   * @returns {Array} - Merged data
   */
  mergeData(serverData, localData, serverIdKey, localServerIdKey) {
    // Create a map of server data by ID
    const serverMap = new Map(serverData.map(item => [item[serverIdKey], item]));
    
    // Create a map of local data by server ID (if available)
    const localMap = new Map();
    for (const localItem of localData) {
      if (localItem.syncStatus === 'pending') {
        // For pending items, use the local data
        if (localItem[localServerIdKey]) {
          serverMap.delete(localItem[localServerIdKey]);
        }
        localMap.set(localItem.id, localItem);
      }
    }
    
    // Combine server and local data
    const merged = Array.from(serverMap.values());
    merged.push(...Array.from(localMap.values()));
    
    return merged;
  }
}

// Export singleton instance
const syncService = new SyncService();
export default syncService;
