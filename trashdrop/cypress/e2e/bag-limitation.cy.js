describe('Bag Limitation Feature Tests', () => {
  beforeEach(() => {
    // Reset local storage and database before each test
    indexedDB.deleteDatabase('trashdrop_offline_db');
    localStorage.clear();
    
    // Visit the homepage first - auth mocking will be handled by cy.mockAuthState()
    cy.visit('/');
    
    // Custom data for this specific test suite
    cy.window().then(win => {
      // Make sure Cypress is initialized correctly
      if (!win.Cypress) {
        win.Cypress = {};
      }
      
      // Specifically override the user stats for bag tests
      if (win.Cypress.supabase) {
        const originalFrom = win.Cypress.supabase.from;
        win.Cypress.supabase.from = (table) => {
          if (table === 'user_stats') {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: { user_id: 'test-user-id', total_bags: 3, total_batches: 1 },
                    error: null
                  })
                })
              })
            };
          }
          return originalFrom(table);
        };
      }
    });
      }
    });
    
    // Visit the pickup request page
    cy.visit('/pickup');
  });

  it('should show the correct number of bag options based on available bags', () => {
    // Should display user's bag count
    cy.contains('You have 3 bag(s) available').should('be.visible');
    
    // Check the Number of Bags dropdown options
    cy.get('select[name="numberOfBags"]').should('be.visible')
      .select('1')
      .find('option').should('have.length', 3); // Should have exactly 3 options
      
    // Verify options are 1, 2, and 3
    cy.get('select[name="numberOfBags"] option').eq(0).should('have.value', '1');
    cy.get('select[name="numberOfBags"] option').eq(1).should('have.value', '2');
    cy.get('select[name="numberOfBags"] option').eq(2).should('have.value', '3');
  });

  it('should disable the bag selector when user has 0 bags', () => {
    // Mock user with 0 bags
    cy.window().then(win => {
      // Override the user stats in the component's state
      win.userStats = { totalBags: 0, batches: 0 };
      
      // Override the Supabase response
      cy.stub(win.supabase, 'from').returns({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: { user_id: 'test-user-id', total_bags: 0, total_batches: 0 },
              error: null
            })
          })
        })
      });
      
      // Force component to re-render
      win.dispatchEvent(new Event('focus'));
    });
    
    // Reload the page to apply mock
    cy.reload();
    
    // Should show warning message
    cy.contains('No bags available').should('be.visible');
    
    // Dropdown should be disabled
    cy.get('select[name="numberOfBags"]').should('be.disabled');
  });

  it('should limit dropdown to 10 options when user has more than 10 bags', () => {
    // Mock user with 15 bags
    cy.window().then(win => {
      // Override the user stats in the component's state
      win.userStats = { totalBags: 15, batches: 2 };
      
      // Override the Supabase response
      cy.stub(win.supabase, 'from').returns({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: { user_id: 'test-user-id', total_bags: 15, total_batches: 2 },
              error: null
            })
          })
        })
      });
      
      // Force component to re-render
      win.dispatchEvent(new Event('focus'));
    });
    
    // Reload the page to apply mock
    cy.reload();
    
    // Should display user's bag count
    cy.contains('You have 15 bag(s) available').should('be.visible');
    
    // Check the Number of Bags dropdown options - should be limited to 10
    cy.get('select[name="numberOfBags"]').should('be.visible')
      .find('option').should('have.length', 10); // Should have exactly 10 options
      
    // Verify highest option is 10
    cy.get('select[name="numberOfBags"] option').last().should('have.value', '10');
  });

  it('should prevent submission when trying to request more bags than available', () => {
    // Mock user with 2 bags
    cy.window().then(win => {
      // Override the user stats in the component's state
      win.userStats = { totalBags: 2, batches: 1 };
      
      // Override the Supabase response
      cy.stub(win.supabase, 'from').returns({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: { user_id: 'test-user-id', total_bags: 2, total_batches: 1 },
              error: null
            })
          })
        })
      });
      
      // Mock form validation error
      cy.stub(win, 'Yup', {
        object: {
          shape: () => ({
            validate: (values) => {
              if (Number(values.numberOfBags) > 2) {
                throw new Error(`You only have 2 bag(s) available`);
              }
              return values;
            }
          })
        }
      });
    });
    
    // Reload the page to apply mock
    cy.reload();
    
    // Try to select 3 bags (this shouldn't be possible in UI)
    cy.window().then(win => {
      // Force an invalid selection
      const select = win.document.querySelector('select[name="numberOfBags"]');
      if (select) {
        const option = document.createElement('option');
        option.value = '3';
        option.text = '3 Bags';
        select.add(option);
        select.value = '3';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    // Submit the form
    cy.get('button[type="submit"]').contains('Submit').click();
    
    // Should show validation error
    cy.contains('You only have 2 bag(s) available').should('be.visible');
  });
});
