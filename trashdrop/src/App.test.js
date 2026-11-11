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

test('signed out at /, shows the TrashDrop header with Login and Register', () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );

  // The logo appears more than once (header and the install prompt)
  expect(screen.getAllByRole('img', { name: /trashdrop logo/i }).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { level: 1, name: 'TrashDrop' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
});
