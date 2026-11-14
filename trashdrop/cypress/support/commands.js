// Test sign-in comes from Cypress.env (TEST_EMAIL, TEST_PASSWORD; e.g. cypress.env.json,
// not committed). The account these files used to name was blocked on
// 2026-11-14: its password had been committed here.
// ***********************************************
// This file can be used to add custom commands to Cypress
// ***********************************************

// Login command using special test credentials
Cypress.Commands.add('login', () => {
  cy.visit('/login');
  cy.get('#email').type(Cypress.env('TEST_EMAIL'));
  cy.get('#password').type(Cypress.env('TEST_PASSWORD'));
  cy.get('button[type="submit"]').click();
  // Wait for successful login
  cy.url().should('not.include', '/login');
});

// Wait for toast notification with specific message
// More robust: searches by text content, allows longer timeout, and validates type class if provided
Cypress.Commands.add('waitForToast', (message, type = '', options = {}) => {
  const { timeout = 10000 } = options;
  const baseSelector = '.toast-notification';
  const selector = type ? `${baseSelector}.${type}` : baseSelector;

  // Use cy.contains to match exact toast element containing the message
  cy.contains(selector, message, { timeout })
    .should('be.visible')
    .then(($el) => {
      if (type) {
        expect($el).to.have.class(type);
      }
    });
});

// Wait for toast notification to disappear
Cypress.Commands.add('waitForToastDismissal', () => {
  cy.get('.toast-notification').should('not.exist');
});

// Helper for checking CSS properties
Cypress.Commands.add('hasCssProperty', (selector, property, value) => {
  cy.get(selector).should('have.css', property, value);
});

// Helper for checking Tailwind classes
Cypress.Commands.add('hasTailwindClass', (selector, classPrefix) => {
  cy.get(selector)
    .invoke('attr', 'class')
    .should('contain', classPrefix);
});
