// ***********************************************************
// This support file is automatically loaded for e2e tests
// ***********************************************************

// Import commands.js using ES2015 syntax
import './commands';
// Import auth mocks
import { mockFullAuth, mockSupabaseClient } from './auth-mocks';

// Add auth mocking commands
Cypress.Commands.add('mockAuthState', () => {
  // Use our auth mocking utility
  cy.window().then(win => {
    mockFullAuth();
    mockSupabaseClient(win);
  });
});

// Automatically set up auth mocking before each test
beforeEach(() => {
  cy.mockAuthState();
});

// Prevent uncaught exceptions from failing tests
Cypress.on('uncaught:exception', (err, runnable) => {
  // returning false here prevents Cypress from
  // failing the test when an uncaught exception occurs
  console.log('Uncaught exception:', err.message);
  return false;
});
