import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNetwork } from '../utils/networkMonitor.js';

// Create the context
const OfflineQueueContext = createContext();

// Custom hook to use the offline queue
const useOfflineQueue = () => useContext(OfflineQueueContext);

// Provider component
const OfflineQueueProvider = ({ children }) => {
  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isOnline } = useNetwork();

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem('offlineQueue');
      if (savedQueue) {
        setQueue(JSON.parse(savedQueue));
      }
    } catch (error) {
      console.error('Failed to load offline queue from localStorage:', error);
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('offlineQueue', JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save offline queue to localStorage:', error);
    }
  }, [queue]);

  // Process the queue when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0 && !isProcessing) {
      processQueue();
    }
  }, [isOnline, queue.length, isProcessing]);

  // Add an operation to the queue
  const addToQueue = useCallback((operation) => {
    setQueue(prevQueue => [
      ...prevQueue,
      {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...operation
      }
    ]);
  }, []);

  // Process all operations in the queue
  const processQueue = useCallback(async () => {
    if (queue.length === 0 || !isOnline || isProcessing) return;

    setIsProcessing(true);
    const currentQueue = [...queue];
    const successfulOperations = [];
    const failedOperations = [];

    // Process each operation in the queue
    for (const operation of currentQueue) {
      try {
        // Execute the operation
        const result = await operation.execute();
        successfulOperations.push(operation.id);
        console.log('Processed operation:', operation.id, result);
      } catch (error) {
        console.error('Failed to process operation:', operation.id, error);
        failedOperations.push(operation);
      }
    }

    // Update the queue with any failed operations
    setQueue(failedOperations);
    setIsProcessing(false);

    return {
      success: successfulOperations.length,
      failed: failedOperations.length
    };
  }, [queue, isOnline, isProcessing]);

  // Clear the queue
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Remove a specific operation from the queue
  const removeFromQueue = useCallback((operationId) => {
    setQueue(prevQueue => prevQueue.filter(op => op.id !== operationId));
  }, []);

  // Context value
  const value = {
    queue,
    isProcessing,
    addToQueue,
    processQueue,
    clearQueue,
    removeFromQueue,
    queueSize: queue.length,
    hasPendingOperations: queue.length > 0
  };

  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  );
};

export { OfflineQueueProvider, useOfflineQueue };
export default OfflineQueueContext;
