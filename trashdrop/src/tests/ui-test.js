// UI component testing file
// Tests that styled components render correctly

import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import NavBar from '../components/NavBar';
import LoadingSpinner from '../components/LoadingSpinner';
import OfflineIndicator from '../components/OfflineIndicator';

// Test NavBar styling
describe('NavBar UI Component', () => {
  test('renders with proper styling', () => {
    render(
      <BrowserRouter>
        <NavBar />
      </BrowserRouter>
    );

    // Check that NavBar contains the logo
    const logo = screen.getByText(/TrashDrop/i) || screen.getByAltText(/logo/i);
    expect(logo).toBeInTheDocument();
    
    // Check that the navbar element exists
    const navbar = document.querySelector('nav');
    expect(navbar).toBeInTheDocument();
    
    // If we want to verify specific Tailwind classes are applied
    expect(navbar.className).toContain('bg-');
  });
});

// Test LoadingSpinner styling
describe('LoadingSpinner UI Component', () => {
  test('renders with proper styling', () => {
    render(<LoadingSpinner />);
    
    // Check that spinner container exists
    const spinner = document.querySelector('div[role="status"]') || 
                   document.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
    
    // Check that animation styling is applied
    // This verifies that CSS for animations is loading
    const spinnerStyle = window.getComputedStyle(spinner);
    expect(spinner.className).toContain('animate-') || 
      expect(spinnerStyle.animation).toBeTruthy();
  });
});

// Test OfflineIndicator styling
describe('OfflineIndicator UI Component', () => {
  test('renders with proper styling when offline', () => {
    // Mock navigator.onLine to be false
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    
    render(<OfflineIndicator />);
    
    // Check that offline message is displayed with proper styling
    const offlineMessage = screen.getByText(/offline/i);
    expect(offlineMessage).toBeInTheDocument();
    
    // Check that styling classes are applied
    const indicator = offlineMessage.closest('div');
    expect(indicator.className).toContain('bg-') || 
      expect(indicator.className).toContain('text-');
    
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });
});
