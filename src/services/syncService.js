/**
 * Background sync service for offline-created reports
 * Handles syncing pending_sync items to Supabase when connectivity is restored
 */

import supabase from '../utils/supabaseClient.js';
import { toastService } from './toastService.js';

class SyncService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.syncQueue = new Set();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processPendingSync();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Periodic sync check (every 30 seconds when online)
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.processPendingSync();
      }
    }, 30000);
  }

  /**
   * Add item to sync queue for immediate processing
   * @param {string} type - Type of sync ('dumping_report', 'digital_bin', etc.)
   * @param {string} localId - Local item ID
   */
  enqueueSyncItem(type, localId) {
    const syncItem = `${type}:${localId}`;
    this.syncQueue.add(syncItem);
    
    if (this.isOnline && !this.syncInProgress) {
      // Attempt immediate sync
      setTimeout(() => this.processPendingSync(), 100);
    }
  }

  /**
   * Process all pending sync items
   */
  async processPendingSync() {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    console.log('[SyncService] Starting background sync process');

    try {
      // Process dumping reports
      await this.syncPendingDumpingReports();
      
      // Process digital bins
      await this.syncPendingDigitalBins();
      
      // Process any queued items
      await this.processQueuedItems();
      
      console.log('[SyncService] Background sync completed successfully');
    } catch (error) {
      console.error('[SyncService] Background sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync pending dumping reports to Supabase
   */
  async syncPendingDumpingReports() {
    try {
      const reportList = JSON.parse(localStorage.getItem('illegalDumpingList') || '[]');
      let synced = 0;
      let failed = 0;

      for (const reportId of reportList) {
        const reportKey = `illegalDumping_${reportId}`;
        const reportData = JSON.parse(localStorage.getItem(reportKey) || 'null');
        
        if (!reportData || reportData.sync_status !== 'pending_sync') {
          continue;
        }

        console.log(`[SyncService] Syncing dumping report: ${reportId}`);

        try {
          // Prepare report for database (remove local fields)
          const { id, sync_status, ...dbReport } = reportData;
          
          // Insert into illegal_dumping_mobile table
          const { data: syncedReport, error } = await supabase
            .from('illegal_dumping_mobile')
            .insert(dbReport)
            .select()
            .single();

          if (error) {
            console.error(`[SyncService] Failed to sync report ${reportId}:`, error);
            failed++;
            continue;
          }

          // Update local storage with synced data
          const syncedData = {
            ...reportData,
            id: syncedReport.id, // Use server-generated ID
            sync_status: 'synced',
            synced_at: new Date().toISOString()
          };

          localStorage.setItem(reportKey, JSON.stringify(syncedData));

          // Try to sync to dumping_reports_mobile table as well
          try {
            const reportDetails = {
              dumping_id: syncedReport.id,
              estimated_volume: reportData.estimated_volume || 'unknown',
              hazardous_materials: reportData.hazardous_materials || false,
              accessibility_notes: reportData.description || reportData.accessibility_notes || 'Synced from offline report'
            };

            await supabase
              .from('dumping_reports_mobile')
              .insert(reportDetails);

          } catch (detailsError) {
            console.warn(`[SyncService] Could not sync report details for ${reportId}:`, detailsError);
          }

          synced++;
          console.log(`[SyncService] Successfully synced report: ${reportId} -> ${syncedReport.id}`);

        } catch (syncError) {
          console.error(`[SyncService] Sync error for report ${reportId}:`, syncError);
          failed++;
        }
      }

      if (synced > 0) {
        console.log(`[SyncService] Synced ${synced} dumping reports to server`);
        toastService.show(`Synced ${synced} offline reports`, 'success');
      }

      if (failed > 0) {
        console.warn(`[SyncService] Failed to sync ${failed} dumping reports`);
      }

    } catch (error) {
      console.error('[SyncService] Error in syncPendingDumpingReports:', error);
    }
  }

  /**
   * Sync pending digital bins to Supabase
   */
  async syncPendingDigitalBins() {
    try {
      const binList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
      let synced = 0;

      for (const binId of binList) {
        const binKey = `digitalBin_${binId}`;
        const binData = JSON.parse(localStorage.getItem(binKey) || 'null');
        
        if (!binData || binData.sync_status !== 'pending_sync') {
          continue;
        }

        console.log(`[SyncService] Syncing digital bin: ${binId}`);

        try {
          // Prepare bin data for database (remove local fields)
          const { sync_status, ...dbBin } = binData;
          
          // Insert into digital_bins table
          const { data: syncedBin, error } = await supabase
            .from('digital_bins')
            .insert(dbBin)
            .select()
            .single();

          if (error) {
            console.error(`[SyncService] Failed to sync bin ${binId}:`, error);
            continue;
          }

          // Update local storage
          const syncedData = {
            ...binData,
            id: syncedBin.id,
            sync_status: 'synced',
            synced_at: new Date().toISOString()
          };

          localStorage.setItem(binKey, JSON.stringify(syncedData));
          synced++;

          console.log(`[SyncService] Successfully synced digital bin: ${binId} -> ${syncedBin.id}`);

        } catch (syncError) {
          console.error(`[SyncService] Sync error for bin ${binId}:`, syncError);
        }
      }

      if (synced > 0) {
        console.log(`[SyncService] Synced ${synced} digital bins to server`);
        toastService.show(`Synced ${synced} offline digital bins`, 'success');
      }

    } catch (error) {
      console.error('[SyncService] Error in syncPendingDigitalBins:', error);
    }
  }

  /**
   * Process items in the sync queue
   */
  async processQueuedItems() {
    for (const item of this.syncQueue) {
      const [type, localId] = item.split(':');
      
      try {
        switch (type) {
          case 'dumping_report':
            await this.syncSingleDumpingReport(localId);
            break;
          case 'digital_bin':
            await this.syncSingleDigitalBin(localId);
            break;
          default:
            console.warn(`[SyncService] Unknown sync type: ${type}`);
        }
        
        // Remove from queue on success
        this.syncQueue.delete(item);
        
      } catch (error) {
        console.error(`[SyncService] Failed to sync queued item ${item}:`, error);
        // Keep in queue for retry
      }
    }
  }

  /**
   * Sync a single dumping report by local ID
   * @param {string} localId - Local report ID
   */
  async syncSingleDumpingReport(localId) {
    const reportKey = `illegalDumping_${localId}`;
    const reportData = JSON.parse(localStorage.getItem(reportKey) || 'null');
    
    if (!reportData || reportData.sync_status === 'synced') {
      return;
    }

    const { id, sync_status, ...dbReport } = reportData;
    
    const { data: syncedReport, error } = await supabase
      .from('illegal_dumping_mobile')
      .insert(dbReport)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Update local storage
    const syncedData = {
      ...reportData,
      id: syncedReport.id,
      sync_status: 'synced',
      synced_at: new Date().toISOString()
    };

    localStorage.setItem(reportKey, JSON.stringify(syncedData));
    console.log(`[SyncService] Queued report synced: ${localId} -> ${syncedReport.id}`);
  }

  /**
   * Sync a single digital bin by local ID
   * @param {string} localId - Local bin ID
   */
  async syncSingleDigitalBin(localId) {
    const binKey = `digitalBin_${localId}`;
    const binData = JSON.parse(localStorage.getItem(binKey) || 'null');
    
    if (!binData || binData.sync_status === 'synced') {
      return;
    }

    const { sync_status, ...dbBin } = binData;
    
    const { data: syncedBin, error } = await supabase
      .from('digital_bins')
      .insert(dbBin)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Update local storage
    const syncedData = {
      ...binData,
      id: syncedBin.id,
      sync_status: 'synced',
      synced_at: new Date().toISOString()
    };

    localStorage.setItem(binKey, JSON.stringify(syncedData));
    console.log(`[SyncService] Queued bin synced: ${localId} -> ${syncedBin.id}`);
  }

  /**
   * Get sync status information
   * @returns {Object} Sync status details
   */
  getSyncStatus() {
    const reportList = JSON.parse(localStorage.getItem('illegalDumpingList') || '[]');
    const binList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
    
    let pendingReports = 0;
    let pendingBins = 0;
    
    // Count pending sync items
    for (const reportId of reportList) {
      const reportData = JSON.parse(localStorage.getItem(`illegalDumping_${reportId}`) || 'null');
      if (reportData?.sync_status === 'pending_sync') {
        pendingReports++;
      }
    }
    
    for (const binId of binList) {
      const binData = JSON.parse(localStorage.getItem(`digitalBin_${binId}`) || 'null');
      if (binData?.sync_status === 'pending_sync') {
        pendingBins++;
      }
    }
    
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      pendingReports,
      pendingBins,
      queueSize: this.syncQueue.size,
      totalPending: pendingReports + pendingBins + this.syncQueue.size
    };
  }

  /**
   * Force a manual sync attempt
   */
  async forcSync() {
    if (this.syncInProgress) {
      console.log('[SyncService] Sync already in progress');
      return;
    }
    
    console.log('[SyncService] Manual sync requested');
    await this.processPendingSync();
  }
}

// Create singleton instance
const syncService = new SyncService();

export default syncService;
