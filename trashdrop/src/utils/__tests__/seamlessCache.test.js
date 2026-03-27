/**
 * Test Suite for Seamless Cache
 * Verifies no data loss during updates and proper background synchronization
 */

import seamlessCache from '../seamlessCache.js';

describe('SeamlessCache', () => {
  let mockFetchFn;
  let cacheKey;

  beforeEach(() => {
    mockFetchFn = jest.fn();
    cacheKey = 'test_key';
    seamlessCache.clear();
  });

  afterEach(() => {
    seamlessCache.clear();
    jest.clearAllMocks();
  });

  describe('Basic Caching', () => {
    test('should return data immediately on first call', async () => {
      const testData = { value: 42 };
      mockFetchFn.mockResolvedValue(testData);

      const result = await seamlessCache.get(cacheKey, mockFetchFn);

      expect(result).toEqual(testData);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    test('should return cached data on subsequent calls', async () => {
      const testData = { value: 42 };
      mockFetchFn.mockResolvedValue(testData);

      // First call
      await seamlessCache.get(cacheKey, mockFetchFn);
      
      // Second call should use cache
      const result = await seamlessCache.get(cacheKey, mockFetchFn);

      expect(result).toEqual(testData);
      expect(mockFetchFn).toHaveBeenCalledTimes(1); // Only called once
    });

    test('should return stale data while refreshing in background', async () => {
      const staleData = { value: 'old' };
      const freshData = { value: 'new' };
      
      // Set up stale cache
      seamlessCache.cache.set(cacheKey, {
        data: staleData,
        timestamp: Date.now() - 35000, // 35 seconds ago (stale)
        ttl: 30000
      });

      mockFetchFn.mockResolvedValue(freshData);

      // Should return stale data immediately
      const result = await seamlessCache.get(cacheKey, mockFetchFn);

      expect(result).toEqual(staleData); // Returns stale data immediately
      
      // Wait for background update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check if cache was updated
      const cachedData = seamlessCache.peek(cacheKey);
      expect(cachedData).toEqual(freshData);
    });
  });

  describe('Optimistic Updates', () => {
    test('should apply optimistic updates immediately', async () => {
      const currentData = { count: 1 };
      const updateFn = (data) => ({ ...data, count: data.count + 1 });
      const confirmFn = jest.fn().mockResolvedValue({ count: 2 });

      seamlessCache.cache.set(cacheKey, {
        data: currentData,
        timestamp: Date.now(),
        ttl: 30000
      });

      const result = await seamlessCache.optimisticUpdate(cacheKey, updateFn, confirmFn);

      expect(result).toEqual({ count: 2 });
      expect(confirmFn).toHaveBeenCalled();
    });

    test('should rollback on confirmation failure', async () => {
      const currentData = { count: 1 };
      const updateFn = (data) => ({ ...data, count: data.count + 1 });
      const confirmFn = jest.fn().mockRejectedValue(new Error('Server error'));

      seamlessCache.cache.set(cacheKey, {
        data: currentData,
        timestamp: Date.now(),
        ttl: 30000
      });

      try {
        await seamlessCache.optimisticUpdate(cacheKey, updateFn, confirmFn);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Server error');
      }

      // Should rollback to original data
      const cachedData = seamlessCache.peek(cacheKey);
      expect(cachedData).toEqual(currentData);
    });
  });

  describe('Subscriptions', () => {
    test('should notify subscribers of data changes', async () => {
      const testData = { value: 42 };
      const subscriber = jest.fn();
      
      seamlessCache.subscribe(cacheKey, subscriber);
      mockFetchFn.mockResolvedValue(testData);

      await seamlessCache.get(cacheKey, mockFetchFn);

      expect(subscriber).toHaveBeenCalledWith(testData, 'fresh');
    });

    test('should notify subscribers of optimistic updates', async () => {
      const currentData = { count: 1 };
      const subscriber = jest.fn();
      const updateFn = (data) => ({ ...data, count: data.count + 1 });
      const confirmFn = jest.fn().mockResolvedValue({ count: 2 });

      seamlessCache.cache.set(cacheKey, {
        data: currentData,
        timestamp: Date.now(),
        ttl: 30000
      });

      seamlessCache.subscribe(cacheKey, subscriber);

      await seamlessCache.optimisticUpdate(cacheKey, updateFn, confirmFn);

      expect(subscriber).toHaveBeenCalledWith({ count: 2 }, 'optimistic');
      expect(subscriber).toHaveBeenCalledWith({ count: 2 }, 'confirmed');
    });

    test('should unsubscribe correctly', () => {
      const subscriber = jest.fn();
      const unsubscribe = seamlessCache.subscribe(cacheKey, subscriber);

      unsubscribe();

      // Should not call subscriber after unsubscribe
      seamlessCache.notifySubscribers(cacheKey, { test: 'data' }, 'test');
      expect(subscriber).not.toHaveBeenCalled();
    });
  });

  describe('Background Updates', () => {
    test('should not block UI during background updates', async () => {
      const staleData = { value: 'stale' };
      const freshData = { value: 'fresh' };
      
      // Set up stale cache
      seamlessCache.cache.set(cacheKey, {
        data: staleData,
        timestamp: Date.now() - 35000,
        ttl: 30000
      });

      // Mock slow fetch
      mockFetchFn.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(freshData), 100))
      );

      const startTime = Date.now();
      const result = await seamlessCache.get(cacheKey, mockFetchFn);
      const endTime = Date.now();

      // Should return stale data immediately (under 50ms)
      expect(endTime - startTime).toBeLessThan(50);
      expect(result).toEqual(staleData);

      // Wait for background update
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Cache should be updated with fresh data
      const cachedData = seamlessCache.peek(cacheKey);
      expect(cachedData).toEqual(freshData);
    });
  });

  describe('Cache Management', () => {
    test('should invalidate cache correctly', () => {
      const testData = { value: 42 };
      seamlessCache.cache.set(cacheKey, {
        data: testData,
        timestamp: Date.now(),
        ttl: 30000
      });

      seamlessCache.invalidate(cacheKey);

      expect(seamlessCache.peek(cacheKey)).toBeUndefined();
    });

    test('should check cache freshness correctly', () => {
      const freshData = { value: 'fresh' };
      seamlessCache.cache.set(cacheKey, {
        data: freshData,
        timestamp: Date.now(),
        ttl: 30000
      });

      expect(seamlessCache.isFresh(cacheKey)).toBe(true);

      // Make cache stale
      seamlessCache.cache.set(cacheKey, {
        data: freshData,
        timestamp: Date.now() - 35000,
        ttl: 30000
      });

      expect(seamlessCache.isFresh(cacheKey)).toBe(false);
    });

    test('should provide accurate cache statistics', () => {
      const key1 = 'test1';
      const key2 = 'test2';
      
      seamlessCache.cache.set(key1, {
        data: { value: 1 },
        timestamp: Date.now(),
        ttl: 30000
      });

      seamlessCache.cache.set(key2, {
        data: { value: 2 },
        timestamp: Date.now() - 35000,
        ttl: 30000
      });

      const stats = seamlessCache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.freshEntries).toBe(1);
      expect(stats.staleEntries).toBe(1);
    });
  });

  describe('Preloading', () => {
    test('should preload data in background', async () => {
      const testData = { value: 'preloaded' };
      mockFetchFn.mockResolvedValue(testData);

      seamlessCache.preload(cacheKey, mockFetchFn);

      // Should not be cached immediately
      expect(seamlessCache.peek(cacheKey)).toBeUndefined();

      // Wait for preload to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(seamlessCache.peek(cacheKey)).toEqual(testData);
    });
  });

  describe('Error Handling', () => {
    test('should handle fetch errors gracefully', async () => {
      const error = new Error('Network error');
      mockFetchFn.mockRejectedValue(error);

      try {
        await seamlessCache.get(cacheKey, mockFetchFn);
        fail('Should have thrown an error');
      } catch (err) {
        expect(err).toBe(error);
      }
    });

    test('should keep existing cache on background update failure', async () => {
      const cachedData = { value: 'cached' };
      const error = new Error('Background update failed');
      
      seamlessCache.cache.set(cacheKey, {
        data: cachedData,
        timestamp: Date.now() - 35000,
        ttl: 30000
      });

      mockFetchFn.mockRejectedValue(error);

      const result = await seamlessCache.get(cacheKey, mockFetchFn);

      expect(result).toEqual(cachedData);
      
      // Wait for background update to fail
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should keep original cached data
      const finalData = seamlessCache.peek(cacheKey);
      expect(finalData).toEqual(cachedData);
    });
  });
});
