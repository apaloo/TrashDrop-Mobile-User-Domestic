// Pickup request bag limitation feature tests
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PickupRequest from '../pages/PickupRequest';
import { AuthContext } from '../context/AuthContext';
import supabase from '../utils/supabaseClient';

// Mock supabase
jest.mock('../utils/supabaseClient', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { total_bags: 3, total_batches: 1 },
      error: null
    }),
    insert: jest.fn().mockResolvedValue({
      data: [{ id: '123' }],
      error: null
    }),
    rpc: jest.fn().mockResolvedValue({
      data: true,
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

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ state: null })
}));

// Mock Leaflet map container since it's not available in test environment
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div>TileLayer</div>,
  Marker: () => <div>Marker</div>,
  useMapEvents: () => ({ addEventParent: jest.fn() })
}));

// Wrap component with necessary providers
const renderPickupRequestWithContext = (userStats = { totalBags: 3 }) => {
  const mockUser = { id: 'user123', email: 'test@example.com' };
  
  return render(
    <BrowserRouter>
      <AuthContext.Provider value={{ user: mockUser }}>
        <PickupRequest />
      </AuthContext.Provider>
    </BrowserRouter>
  );
};

describe('PickupRequest - Bag Limitation Feature', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });
  
  test('displays the correct number of bag options based on available bags', async () => {
    // Mock user with 3 bags available
    supabase.from().select().eq().single.mockResolvedValueOnce({
      data: { total_bags: 3, total_batches: 1 },
      error: null
    });
    
    renderPickupRequestWithContext();
    
    // Wait for the component to fetch user stats
    await waitFor(() => {
      expect(screen.getByText(/You have 3 bags available/)).toBeInTheDocument();
    });
    
    // Open the dropdown and check the options
    const bagSelect = screen.getByLabelText(/Number of Bags/i);
    fireEvent.click(bagSelect);
    
    // Check that there are exactly 3 options for bags (1, 2, 3)
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0].value).toBe('1');
    expect(options[1].value).toBe('2');
    expect(options[2].value).toBe('3');
    
    // Should not have option for 4 bags
    expect(options.find(option => option.value === '4')).toBeUndefined();
  });
  
  test('disables the dropdown when user has 0 bags available', async () => {
    // Mock user with 0 bags available
    supabase.from().select().eq().single.mockResolvedValueOnce({
      data: { total_bags: 0, total_batches: 1 },
      error: null
    });
    
    renderPickupRequestWithContext({ totalBags: 0 });
    
    // Wait for component to fetch user stats
    await waitFor(() => {
      const bagSelect = screen.getByLabelText(/Number of Bags/i);
      expect(bagSelect).toBeDisabled();
      
      // Should show a warning about no bags
      expect(screen.getByText(/You don't have any bags available/i)).toBeInTheDocument();
    });
  });
  
  test('shows maximum of 10 options when user has more than 10 bags', async () => {
    // Mock user with 15 bags available
    supabase.from().select().eq().single.mockResolvedValueOnce({
      data: { total_bags: 15, total_batches: 2 },
      error: null
    });
    
    renderPickupRequestWithContext({ totalBags: 15 });
    
    // Wait for component to fetch user stats
    await waitFor(() => {
      expect(screen.getByText(/You have 15 bags available/i)).toBeInTheDocument();
    });
    
    // Open the dropdown and check the options
    const bagSelect = screen.getByLabelText(/Number of Bags/i);
    fireEvent.click(bagSelect);
    
    // Check that there are exactly 10 options for bags (1-10)
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(10);
    expect(options[0].value).toBe('1');
    expect(options[9].value).toBe('10');
    
    // Should not have option for 11 bags
    expect(options.find(option => option.value === '11')).toBeUndefined();
  });
  
  test('prevents submission when selecting more bags than available', async () => {
    // Mock user with 2 bags available but try to select 3
    supabase.from().select().eq().single.mockResolvedValueOnce({
      data: { total_bags: 2, total_batches: 1 },
      error: null
    });
    
    renderPickupRequestWithContext({ totalBags: 2 });
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText(/You have 2 bags available/i)).toBeInTheDocument();
    });
    
    // Manually set number of bags to 3 (this shouldn't be possible in UI but testing validation)
    const bagSelect = screen.getByLabelText(/Number of Bags/i);
    fireEvent.change(bagSelect, { target: { value: '3' } });
    
    // Try to submit the form
    const submitButton = screen.getByText(/Submit Request/i);
    fireEvent.click(submitButton);
    
    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/You only have 2 bag\(s\) available/i)).toBeInTheDocument();
    });
    
    // Supabase insert should not have been called
    expect(supabase.from().insert).not.toHaveBeenCalled();
  });
});
