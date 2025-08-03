// ***********************************************
// This file can be used to add custom commands to Cypress
// ***********************************************

// Login command using special test credentials
Cypress.Commands.add('login', () => {
  cy.visit('/login');
  cy.get('#email').type('prince02@mailinator.com');
  cy.get('#password').type('sChool@123');
  cy.get('button[type="submit"]').click();
  // Wait for successful login
  cy.url().should('not.include', '/login');
});

// Wait for toast notification with specific message
Cypress.Commands.add('waitForToast', (message, type = '') => {
  const selector = type ? `.toast-notification.${type}` : '.toast-notification';
  cy.get(selector)
    .should('be.visible')
    .and('contain', message);
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
