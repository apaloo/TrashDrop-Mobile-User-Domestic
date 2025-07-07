// ***********************************************
// This file can be used to add custom commands to Cypress
// ***********************************************

// Example custom command for checking if an element has a specific CSS property
Cypress.Commands.add('hasCssProperty', (selector, property, value) => {
  cy.get(selector).should('have.css', property, value);
});

// Example custom command for checking if Tailwind classes are applied correctly
Cypress.Commands.add('hasTailwindClass', (selector, classPrefix) => {
  cy.get(selector)
    .invoke('attr', 'class')
    .should('contain', classPrefix);
});
