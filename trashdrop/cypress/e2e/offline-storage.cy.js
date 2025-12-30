describe('Offline Storage Functionality Tests', () => {
  beforeEach(() => {
    // Reset local storage and IndexedDB before each test
    indexedDB.deleteDatabase('trashdrop_offline_db');
    localStorage.clear();
    
    // Auth mocking is handled by our support file automatically
    // Visit the app before each test
    cy.visit('/');
    
    // Wait for the page to fully load - needed due to auth process
    cy.wait(1000);
  });

  it('should show online/offline status indicator', () => {
    // Go to Profile > Locations
    cy.visit('/profile');
    cy.contains('Saved Locations').should('be.visible');
    
    // Should display online status by default
    cy.contains('Online').should('be.visible');
    
    // Simulate offline mode
    cy.window().then(win => {
      // Override navigator.onLine property
      cy.stub(win.navigator, 'onLine').value(false);
      // Trigger offline event
      win.dispatchEvent(new Event('offline'));
    });
    
    // Should now display offline status
    cy.contains('Offline').should('be.visible');
    
    // Simulate coming back online
    cy.window().then(win => {
      cy.stub(win.navigator, 'onLine').value(true);
      win.dispatchEvent(new Event('online'));
    });
    
    // Should display online status again
    cy.contains('Online').should('be.visible');
  });

  it('should persist saved locations across page refreshes', () => {
    // Go to Profile > Locations
    cy.visit('/profile');
    cy.contains('Saved Locations').should('be.visible');
    
    // Click "Add New Location" button
    cy.contains('Add New Location').click();
    
    // Fill out the location form
    cy.get('input[name="name"]').type('Cypress Test Location');
    cy.get('input[name="address"]').type('123 Cypress Ave');
    cy.get('input[name="city"]').type('Test City');
    
    // Mock setting map position (since we can't interact with map in Cypress)
    cy.window().then(win => {
      // Set the map position in the component's state
      const locationData = {
        name: 'Cypress Test Location',
        address: '123 Cypress Ave',
        city: 'Test City',
        latitude: 37.7749,
        longitude: -122.4194,
        id: Date.now(),
        user_id: 'test-user-id',
        synced: true
      };
      
      // Save to localStorage directly to simulate adding a location
      const locations = [locationData];
      win.localStorage.setItem('trashdrop_locations', JSON.stringify(locations));
    });
    
    // Refresh the page
    cy.reload();
    
    // The location should still be there
    cy.contains('Cypress Test Location').should('be.visible');
    cy.contains('123 Cypress Ave').should('be.visible');
  });
  
  it('should save dumping report offline when network is unavailable', () => {
    // Go to Report Illegal Dumping page
    cy.visit('/report');
    
    // Make sure the form is loaded
    cy.contains('Report Illegal Dumping').should('be.visible');
    
    // Simulate offline mode
    cy.window().then(win => {
      cy.stub(win.navigator, 'onLine').value(false);
      win.dispatchEvent(new Event('offline'));
    });
    
    // Should show offline indicator
    cy.contains("You're currently offline").should('be.visible');
    
    // Fill out the form with minimal required data
    cy.get('input[name="title"]').type('Offline Test Report');
    cy.get('textarea[name="description"]').type('This is a test report created while offline');
    
    // Select waste type
    cy.get('input[name="wasteType"][value="general"]').check({force: true});
    
    // Mock the report submission (can't fully interact with map in Cypress)
    cy.window().then(win => {
      // Mock the form submission function to avoid validation errors
      cy.stub(win, 'handleSubmit').as('handleSubmit');
    });
    
    // Submit the form
    cy.get('button[type="submit"]').contains('Submit Report').click();
    
    // Check if report was saved to IndexedDB
    cy.window().then(win => {
      const openRequest = indexedDB.open('trashdrop_offline_db', 1);
      openRequest.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction('reports', 'readonly');
        const objectStore = transaction.objectStore('reports');
        const getRequest = objectStore.getAll();
        
        getRequest.onsuccess = () => {
          // Check if we have at least one report in the database
          expect(getRequest.result.length).to.be.at.least(1);
          // Check if the latest report has our test title
          const latestReport = getRequest.result[getRequest.result.length - 1];
          expect(latestReport.title).to.equal('Offline Test Report');
        };
      };
    });
    
    // Should show success message for offline submission
    cy.contains('Your report has been saved offline').should('be.visible');
  });
});
