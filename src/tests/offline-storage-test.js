// Offline storage functionality testing
import { 
  initIndexedDB, 
  saveOfflineReport, 
  getOfflineReports,
  saveOfflineLocation,
  getOfflineLocations,
  markReportSynced,
  markLocationSynced,
  deleteOfflineReport,
  deleteOfflineLocation
} from '../utils/offlineStorage';

// Mock indexedDB
const indexedDB = {
  open: jest.fn()
};

// Mock IDBDatabase
const mockDb = {
  createObjectStore: jest.fn(),
  transaction: jest.fn(),
  objectStore: jest.fn(),
  add: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  getAll: jest.fn(),
  get: jest.fn(),
  clear: jest.fn(),
};

// Mock transactions and object stores
const mockTransaction = {
  objectStore: jest.fn().mockReturnValue(mockDb),
};

const mockObjectStore = {
  add: jest.fn().mockImplementation(() => Promise.resolve()),
  put: jest.fn().mockImplementation(() => Promise.resolve()),
  delete: jest.fn().mockImplementation(() => Promise.resolve()),
  getAll: jest.fn().mockImplementation(() => Promise.resolve([])),
  get: jest.fn().mockImplementation(() => Promise.resolve({})),
  clear: jest.fn().mockImplementation(() => Promise.resolve()),
};

// Mock IDBRequest
const mockRequest = {
  onsuccess: null,
  onerror: null,
  result: mockDb,
  error: null,
};

// Setup and teardown
beforeEach(() => {
  // Reset mocks
  indexedDB.open.mockClear();
  mockDb.createObjectStore.mockClear();
  mockDb.transaction.mockClear();
  mockDb.objectStore.mockClear();
  mockTransaction.objectStore.mockClear();
  mockObjectStore.add.mockClear();
  mockObjectStore.put.mockClear();
  mockObjectStore.delete.mockClear();
  mockObjectStore.getAll.mockClear();
  mockObjectStore.get.mockClear();
  mockObjectStore.clear.mockClear();
  
  // Mock indexedDB.open implementation
  indexedDB.open.mockImplementation(() => {
    setTimeout(() => {
      mockRequest.onsuccess && mockRequest.onsuccess({ target: { result: mockDb } });
    }, 0);
    return mockRequest;
  });
  
  // Mock transaction
  mockDb.transaction.mockReturnValue(mockTransaction);
  
  // Mock objectStore
  mockDb.objectStore.mockReturnValue(mockObjectStore);
  mockTransaction.objectStore.mockReturnValue(mockObjectStore);
  
  // Assign the mock indexedDB to global
  global.indexedDB = indexedDB;
});

describe('IndexedDB Initialization', () => {
  test('initializes database successfully', async () => {
    await initIndexedDB();
    expect(indexedDB.open).toHaveBeenCalledWith('trashdrop_offline_db', 1);
  });
});

describe('Offline Reports Storage', () => {
  test('saves offline report', async () => {
    const mockReport = { id: '123', title: 'Test Report', location: [1, 1] };
    const userId = 'user123';
    
    mockObjectStore.add.mockImplementation(() => ({
      onsuccess: null,
      onerror: null,
    }));
    
    await saveOfflineReport(mockReport, userId);
    expect(mockDb.transaction).toHaveBeenCalledWith('reports', 'readwrite');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('reports');
  });
  
  test('retrieves offline reports', async () => {
    const mockReports = [
      { id: '123', title: 'Test Report 1', synced: false },
      { id: '456', title: 'Test Report 2', synced: false }
    ];
    
    mockObjectStore.getAll.mockImplementation(() => ({
      onsuccess: function() {
        this.result = mockReports;
        return Promise.resolve(mockReports);
      },
      onerror: null,
    }));
    
    const reports = await getOfflineReports('user123');
    expect(mockDb.transaction).toHaveBeenCalledWith('reports', 'readonly');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('reports');
  });
  
  test('marks report as synced', async () => {
    await markReportSynced('123', 'user123');
    expect(mockDb.transaction).toHaveBeenCalledWith('reports', 'readwrite');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('reports');
  });
  
  test('deletes offline report', async () => {
    await deleteOfflineReport('123', 'user123');
    expect(mockDb.transaction).toHaveBeenCalledWith('reports', 'readwrite');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('reports');
  });
});

describe('Offline Locations Storage', () => {
  test('saves offline location', async () => {
    const mockLocation = { id: '123', name: 'Home', latitude: 1, longitude: 1 };
    const userId = 'user123';
    
    mockObjectStore.add.mockImplementation(() => ({
      onsuccess: null,
      onerror: null,
    }));
    
    await saveOfflineLocation(mockLocation, userId);
    expect(mockDb.transaction).toHaveBeenCalledWith('locations', 'readwrite');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('locations');
  });
  
  test('retrieves offline locations', async () => {
    const mockLocations = [
      { id: '123', name: 'Home', synced: false },
      { id: '456', name: 'Work', synced: false }
    ];
    
    mockObjectStore.getAll.mockImplementation(() => ({
      onsuccess: function() {
        this.result = mockLocations;
        return Promise.resolve(mockLocations);
      },
      onerror: null,
    }));
    
    const locations = await getOfflineLocations('user123');
    expect(mockDb.transaction).toHaveBeenCalledWith('locations', 'readonly');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('locations');
  });
  
  test('marks location as synced', async () => {
    await markLocationSynced('123', 'user123');
    expect(mockDb.transaction).toHaveBeenCalledWith('locations', 'readwrite');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('locations');
  });
  
  test('deletes offline location', async () => {
    await deleteOfflineLocation('123', 'user123');
    expect(mockDb.transaction).toHaveBeenCalledWith('locations', 'readwrite');
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('locations');
  });
});
