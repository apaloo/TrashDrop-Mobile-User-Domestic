describe('Dashboard realtime stats updates', () => {
  beforeEach(() => {
    // Clean state
    indexedDB.deleteDatabase('trashdrop_offline_db');
    localStorage.clear();
  });

  it('updates Batches, Bags, and Pickups when a realtime user_stats update arrives', () => {
    cy.visit('/'); // Dashboard is the home route

    // Ensure the test hook is available and then emit an update
    cy.window().should('have.property', 'Cypress').then((win) => {
      // Wait a tick for Dashboard to mount and register the hook
      cy.wrap(null).then(() => {
        expect(win.Cypress.emitStatsUpdate, 'emitStatsUpdate hook').to.be.a('function');
        // Simulate a realtime UPDATE from user_stats
        win.Cypress.emitStatsUpdate('user_stats', {
          eventType: 'UPDATE',
          new: {
            total_bags: 7,
            total_batches: 3,
            pickups: 6,
            points: 250,
            reports: 2,
          },
        });
      });
    });

    // Assert the Batches & Bags card reflects new values
    cy.contains('h3', 'Batches & Bags')
      .closest('div')
      .within(() => {
        // Batches section
        cy.contains('p', 'Batches')
          .parent()
          .find('p')
          .eq(1)
          .should('have.text', '3');

        // Bags section
        cy.contains('p', 'Bags')
          .parent()
          .find('p')
          .eq(1)
          .should('have.text', '7');
      });

    // Assert the Pickups card reflects new value
    cy.contains('h3', 'Pickups')
      .closest('div')
      .within(() => {
        cy.get('p.text-4xl.font-bold').should('have.text', '6');
      });
  });
});
