describe('Locations Offline/Online Synchronization Tests', () => {
  beforeEach(() => {
    // Reset local storage and IndexedDB before each test
    indexedDB.deleteDatabase('trashdrop_offline_db');
    localStorage.clear();
    
    // Visit the profile page with our enhanced auth mocking
    // The auth mocking will be automatically applied by our support file
    cy.visit('/profile');
    
    // Wait for the page to fully load - needed due to auth process
    cy.wait(1000);
  });

  it('should save location offline and sync when coming back online', () => {
    // Navigate to Locations section
    cy.contains('Saved Locations').should('be.visible');
    
    // Simulate offline mode
    cy.window().then(win => {
      cy.stub(win.navigator, 'onLine').value(false);
      win.dispatchEvent(new Event('offline'));
    });
    
    // Verify offline status indicator
    cy.contains('Offline').should('be.visible');
    
    // Click "Add New Location" button
    cy.contains('Add New Location').click();
    
    // Fill out the form
    cy.get('input[name="name"]').type('Offline Saved Location');
    cy.get('input[name="address"]').type('123 Offline Street');
    cy.get('input[name="city"]').type('Offline City');
    
    // Mock the map click event (since we can't interact with map in Cypress)
    cy.window().then(win => {
      if (win.currentMarker) {
        win.currentMarker.setLatLng([40.7128, -74.006]);
      } else {
        // Mock location selection
        const event = new Event('locationSelected');
        event.latlng = { lat: 40.7128, lng: -74.006 };
        win.dispatchEvent(event);
      }
    });
    
    // Save location
    cy.get('form').submit();
    
    // Should show offline saving message
    cy.contains('Saving location offline').should('be.visible');
    
    // Location should be added to the list with "Not synced" indicator
    cy.contains('Offline Saved Location').should('be.visible');
    cy.contains('Not synced').should('be.visible');
    
    // Simulate coming back online
    cy.window().then(win => {
      // Mock successful sync
      cy.stub(win.supabase, 'from').returns({
        insert: () => Promise.resolve({
          data: [{ id: 'new-id', name: 'Offline Saved Location', synced: true }],
          error: null
        })
      });
      
      // Bring the app back online
      cy.stub(win.navigator, 'onLine').value(true);
      win.dispatchEvent(new Event('online'));
    });
    
    // Should now show online indicator
    cy.contains('Online').should('be.visible');
    
    // Should trigger sync
    cy.contains('Syncing locations...').should('be.visible');
    
    // Location should be marked as synced
    cy.contains('Offline Saved Location').should('be.visible');
    cy.contains('Not synced').should('not.exist');
  });

  it('should handle location deletion in offline mode', () => {
    // Set up a test location in localStorage
    cy.window().then(win => {
      const testLocations = [{
        id: 'test-location-id',
        name: 'Test Location',
        address: '123 Test St',
        city: 'Test City',
        latitude: 35.6895,
        longitude: 139.6917,
        user_id: 'test-user-id',
        synced: true
      }];
      
      win.localStorage.setItem('trashdrop_locations', JSON.stringify(testLocations));
    });
    
    // Refresh to show the saved location
    cy.reload();
    
    // Verify location is displayed
    cy.contains('Test Location').should('be.visible');
    
    // Simulate offline mode
    cy.window().then(win => {
      cy.stub(win.navigator, 'onLine').value(false);
      win.dispatchEvent(new Event('offline'));
    });
    
    // Verify offline status indicator
    cy.contains('Offline').should('be.visible');
    
    // Delete the location
    cy.get('[aria-label="Delete location"]').click();
    
    // Should show offline deletion message
    cy.contains('Location marked for deletion').should('be.visible');
    
    // Location should be removed from the UI
    cy.contains('Test Location').should('not.exist');
    
    // Check that deletion request is queued in IndexedDB
    cy.window().then(win => {
      const request = indexedDB.open('trashdrop_offline_db', 1);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['location_deletions'], 'readonly');
        const store = transaction.objectStore('location_deletions');
        const getRequest = store.getAll();
        
        getRequest.onsuccess = () => {
          // Should have one deletion queued
          expect(getRequest.result.length).to.equal(1);
          expect(getRequest.result[0].id).to.equal('test-location-id');
        };
      };
    });
  });

  it('should properly handle network errors when saving locations', () => {
    // Make sure we're online
    cy.window().then(win => {
      cy.stub(win.navigator, 'onLine').value(true);
    });
    
    // Click "Add New Location" button
    cy.contains('Add New Location').click();
    
    // Fill out the form
    cy.get('input[name="name"]').type('Error Test Location');
    cy.get('input[name="address"]').type('123 Error Street');
    cy.get('input[name="city"]').type('Error City');
    
    // Mock network error from Supabase
    cy.window().then(win => {
      // Mock map interaction
      if (win.currentMarker) {
        win.currentMarker.setLatLng([41.8781, -87.6298]);
      }
      
      // Mock Supabase error response
      cy.stub(win.supabase, 'from').returns({
        insert: () => Promise.resolve({
          data: null,
          error: { message: 'Network error' }
        })
      });
    });
    
    // Submit the form
    cy.get('form').submit();
    
    // Should show error message
    cy.contains('Failed to save location').should('be.visible');
    
    // Should still have added location to local storage as fallback
    cy.window().then(win => {
      const locations = JSON.parse(win.localStorage.getItem('trashdrop_locations') || '[]');
      expect(locations.length).to.be.at.least(1);
      
      // The latest entry should be our test location
      const latestLocation = locations[locations.length - 1];
      expect(latestLocation.name).to.equal('Error Test Location');
    });
  });

  it('should sync all offline locations when coming back online', () => {
    // Set up offline locations in IndexedDB
    cy.window().then(win => {
      const openRequest = indexedDB.open('trashdrop_offline_db', 1);
      
      openRequest.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('locations')) {
          db.createObjectStore('locations', { keyPath: 'id' });
        }
      };
      
      openRequest.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['locations'], 'readwrite');
        const store = transaction.objectStore('locations');
        
        // Add 3 offline locations
        const offlineLocations = [
          { id: 'offline-1', name: 'Offline Location 1', address: '123 Sync St', latitude: 40.7128, longitude: -74.006, user_id: 'test-user-id', synced: false },
          { id: 'offline-2', name: 'Offline Location 2', address: '456 Sync Ave', latitude: 37.7749, longitude: -122.4194, user_id: 'test-user-id', synced: false },
          { id: 'offline-3', name: 'Offline Location 3', address: '789 Sync Blvd', latitude: 34.0522, longitude: -118.2437, user_id: 'test-user-id', synced: false }
        ];
        
        offlineLocations.forEach(location => {
          store.add(location);
        });
        
        // Also add them to localStorage for UI display
        win.localStorage.setItem('trashdrop_locations', JSON.stringify(offlineLocations));
      };
    });
    
    // Simulate offline mode
    cy.window().then(win => {
      cy.stub(win.navigator, 'onLine').value(false);
      win.dispatchEvent(new Event('offline'));
    });
    
    // Reload to display offline locations
    cy.reload();
    
    // Verify locations are displayed with "Not synced" badge
    cy.contains('Offline Location 1').should('be.visible');
    cy.contains('Offline Location 2').should('be.visible');
    cy.contains('Offline Location 3').should('be.visible');
    cy.get(':contains("Not synced")').should('have.length.at.least', 3);
    
    // Simulate coming back online
    cy.window().then(win => {
      // Mock successful sync for each location
      let syncedCount = 0;
      
      cy.stub(win.supabase, 'from').returns({
        insert: () => {
          syncedCount++;
          return Promise.resolve({
            data: [{ id: `synced-${syncedCount}`, synced: true }],
            error: null
          });
        }
      });
      
      // Bring the app back online
      cy.stub(win.navigator, 'onLine').value(true);
      win.dispatchEvent(new Event('online'));
    });
    
    // Should trigger sync
    cy.contains('Syncing locations...').should('be.visible');
    
    // After sync completes, all "Not synced" badges should be gone
    cy.get(':contains("Not synced")').should('have.length', 0);
    
    // All locations should still be visible
    cy.contains('Offline Location 1').should('be.visible');
    cy.contains('Offline Location 2').should('be.visible');
    cy.contains('Offline Location 3').should('be.visible');
  });
});
