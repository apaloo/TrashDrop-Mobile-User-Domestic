// Locations component offline functionality testing
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Locations from '../components/profile/Locations';
import { AuthContext } from '../context/AuthContext';
import supabase from '../utils/supabaseClient';
import * as offlineStorage from '../utils/offlineStorage';

// Mock supabase
jest.mock('../utils/supabaseClient', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: null,
      error: null
    }),
    insert: jest.fn().mockResolvedValue({
      data: [{ id: '123' }],
      error: null
    }),
    delete: jest.fn().mockResolvedValue({
      data: null,
      error: null
    }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn()
    })
  }
}));

// Mock the offlineStorage functions
jest.mock('../utils/offlineStorage', () => ({
  saveOfflineLocation: jest.fn().mockResolvedValue(true),
  getOfflineLocations: jest.fn().mockResolvedValue([
    { id: 'offline1', name: 'Offline Location', address: '123 Offline St', latitude: 10, longitude: 10, synced: false }
  ]),
  markLocationSynced: jest.fn().mockResolvedValue(true),
  deleteOfflineLocation: jest.fn().mockResolvedValue(true)
}));

// Mock Leaflet map container since it's not available in test environment
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div>TileLayer</div>,
  Marker: () => <div>Marker</div>,
  useMapEvents: () => ({ addEventParent: jest.fn() })
}));

// Helper function to render the Locations component with context
const renderLocationsWithContext = (isOnline = true) => {
  const mockUser = { id: 'user123', email: 'test@example.com' };
  
  // Mock navigator.onLine
  Object.defineProperty(navigator, 'onLine', { 
    configurable: true, 
    value: isOnline 
  });
  
  // Mock localStorage
  const localStorageMock = (() => {
    let store = {};
    return {
      getItem: jest.fn(key => store[key] || null),
      setItem: jest.fn((key, value) => {
        store[key] = value.toString();
      }),
      removeItem: jest.fn(key => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      })
    };
  })();
  
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
  });
  
  return render(
    <BrowserRouter>
      <AuthContext.Provider value={{ user: mockUser }}>
        <Locations />
      </AuthContext.Provider>
    </BrowserRouter>
  );
};

describe('Locations Component - Offline Functionality', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });
  
  test('loads locations from localStorage when online', async () => {
    // Setup localStorage with saved locations
    const savedLocations = [
      { id: '123', name: 'Home', address: '123 Home St', latitude: 1, longitude: 1 },
      { id: '456', name: 'Work', address: '456 Work Ave', latitude: 2, longitude: 2 }
    ];
    localStorage.setItem('trashdrop_locations', JSON.stringify(savedLocations));
    
    // Mock successful Supabase response with online locations
    supabase.from().select().eq().order.mockResolvedValueOnce({
      data: [
        { id: '123', name: 'Home', address: '123 Home St', latitude: 1, longitude: 1 },
        { id: '456', name: 'Work', address: '456 Work Ave', latitude: 2, longitude: 2 }
      ],
      error: null
    });
    
    renderLocationsWithContext(true);
    
    // Should load locations from localStorage initially
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Work')).toBeInTheDocument();
    });
    
    // Should show online status
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
  
  test('loads locations from IndexedDB when offline', async () => {
    // Set up as offline
    renderLocationsWithContext(false);
    
    // Should call the offline storage getOfflineLocations function
    await waitFor(() => {
      expect(offlineStorage.getOfflineLocations).toHaveBeenCalled();
      expect(screen.getByText('Offline Location')).toBeInTheDocument();
    });
    
    // Should show offline status
    expect(screen.getByText('Offline')).toBeInTheDocument();
    
    // Should show the 'Not synced' badge for offline locations
    expect(screen.getByText('Not synced')).toBeInTheDocument();
  });
  
  test('saves location to IndexedDB when offline', async () => {
    // Setup as offline
    renderLocationsWithContext(false);
    
    // Fill out the form to add a new location
    await waitFor(() => {
      expect(screen.getByText('Add New Location')).toBeInTheDocument();
    });
    
    // Click "Add New Location" button
    fireEvent.click(screen.getByText('Add New Location'));
    
    // Fill out the form
    fireEvent.change(screen.getByLabelText(/Location Name/i), {
      target: { value: 'Coffee Shop' }
    });
    
    fireEvent.change(screen.getByLabelText(/Address/i), {
      target: { value: '789 Coffee St' }
    });
    
    // Submit the form
    fireEvent.submit(screen.getByText('Save Location'));
    
    // Should call saveOfflineLocation
    await waitFor(() => {
      expect(offlineStorage.saveOfflineLocation).toHaveBeenCalled();
      expect(screen.getByText(/Saving location offline/i)).toBeInTheDocument();
    });
    
    // Should not call Supabase insert
    expect(supabase.from().insert).not.toHaveBeenCalled();
  });
  
  test('syncs with Supabase when online', async () => {
    // Mock successful Supabase response
    supabase.from().select().eq().order.mockResolvedValueOnce({
      data: [
        { id: 'server1', name: 'Server Location', address: '100 Server Rd', latitude: 5, longitude: 5 }
      ],
      error: null
    });
    
    renderLocationsWithContext(true);
    
    // Should try to sync with Supabase
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('locations');
      expect(screen.getByText('Server Location')).toBeInTheDocument();
    });
  });
  
  test('deletes location with proper handling based on online status', async () => {
    // Setup with locations
    localStorage.setItem('trashdrop_locations', JSON.stringify([
      { id: '123', name: 'Home', address: '123 Home St', latitude: 1, longitude: 1 }
    ]));
    
    supabase.from().select().eq().order.mockResolvedValueOnce({
      data: [
        { id: '123', name: 'Home', address: '123 Home St', latitude: 1, longitude: 1 }
      ],
      error: null
    });
    
    renderLocationsWithContext(true);
    
    // Wait for location to be displayed
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
    
    // Find and click the delete button (using the trash icon's parent button)
    const deleteButtons = screen.getAllByRole('button');
    const deleteButton = deleteButtons.find(button => 
      button.innerHTML.includes('M19 7l-.867 12.142A2 2 0 0116.138 21H7.862')
    );
    
    fireEvent.click(deleteButton);
    
    // Should call Supabase delete
    await waitFor(() => {
      expect(supabase.from().delete).toHaveBeenCalled();
      expect(screen.getByText(/Location deleted successfully!/i)).toBeInTheDocument();
    });
  });
});

describe('Locations Persistence Tests', () => {
  test('persists locations after refresh', () => {
    // Setup localStorage with saved locations
    const savedLocations = [
      { id: '123', name: 'Home', address: '123 Home St', latitude: 1, longitude: 1 },
      { id: '456', name: 'Work', address: '456 Work Ave', latitude: 2, longitude: 2 }
    ];
    localStorage.setItem('trashdrop_locations', JSON.stringify(savedLocations));
    
    // Initial render
    const { unmount } = renderLocationsWithContext(true);
    
    // Unmount and remount to simulate refresh
    unmount();
    renderLocationsWithContext(true);
    
    // Should still have the locations
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
  });
});
