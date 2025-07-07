// ***********************************************************
// This support file is automatically loaded for e2e tests
// ***********************************************************

// Import commands.js using ES2015 syntax
import './commands';

// Prevent uncaught exceptions from failing tests
Cypress.on('uncaught:exception', (err, runnable) => {
  // returning false here prevents Cypress from
  // failing the test when an uncaught exception occurs
  return false;
});
