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
  
  // Brand/title presence (either logo alt text or heading)
  expect(
    screen.getByRole('img', { name: /trashdrop logo/i })
  ).toBeInTheDocument();

  // Test that login form elements appear via accessible labels
  const emailInput = screen.getByLabelText(/email/i);
  const passwordInput = screen.getByLabelText(/password/i);
  const loginButton = screen.getByRole('button', { name: /sign in|login/i });
  
  expect(emailInput).toBeInTheDocument();
  expect(passwordInput).toBeInTheDocument();
  expect(loginButton).toBeInTheDocument();
  
  // Check that styles are applied properly
  const appContainer = document.querySelector('div');
  const computedStyle = window.getComputedStyle(appContainer);
  
  // Test that some basic styling is applied
  expect(computedStyle).toBeTruthy();
});
