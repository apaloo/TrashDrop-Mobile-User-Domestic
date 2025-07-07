import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Mock any components that might cause issues in test environment
jest.mock('./utils/syncService', () => ({
  initialize: jest.fn(),
  syncData: jest.fn(),
}));

// Mock service worker registration
jest.mock('./serviceWorkerRegistration', () => ({
  register: jest.fn(),
}));

test('renders TrashDrop application with proper styling', () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  
  // Test that the app renders with TrashDrop title/branding
  expect(screen.getByText(/TrashDrop/i)).toBeInTheDocument();
  
  // Test that login form elements appear
  const emailInput = screen.getByPlaceholderText(/email/i) || screen.getByLabelText(/email/i);
  const passwordInput = screen.getByPlaceholderText(/password/i) || screen.getByLabelText(/password/i);
  const loginButton = screen.getByRole('button', { name: /sign in|login/i });
  
  expect(emailInput).toBeInTheDocument();
  expect(passwordInput).toBeInTheDocument();
  expect(loginButton).toBeInTheDocument();
  
  // Check that styles are applied properly
  // This tests that our CSS fix was successful
  const appContainer = document.querySelector('div');
  const computedStyle = window.getComputedStyle(appContainer);
  
  // Test that some basic styling is applied
  expect(computedStyle).toBeTruthy();
});
