describe('Digital Bin Flow', () => {
  beforeEach(() => {
    // Mock geolocation
    cy.window().then((win) => {
      cy.stub(win.navigator.geolocation, 'getCurrentPosition').callsFake((cb) => {
        return cb({
          coords: {
            latitude: 5.6037,
            longitude: -0.1870
          }
        });
      });
    });

    // Visit the app and login as test user
    cy.visit('/');
    cy.get('#email').type('prince02@mailinator.com');
    cy.get('#password').type('sChool@123');
    cy.get('button[type="submit"]').click();
  });

  it('should complete the Digital Bin flow successfully', () => {
    // Step 1: Location Step
    cy.get('#address').should('be.visible').type('123 Test Street');
    cy.get('.leaflet-container').should('be.visible').click();
    // Wait for location selection success
    cy.waitForToast('Location selected successfully', 'success');
    cy.contains('button', 'Continue').click();

    // Step 2: Schedule Details Step
    cy.get('select[name="frequency"]').select('weekly');
    cy.get('input[type="date"]').type('2024-02-01');
    cy.get('select[name="preferredTime"]').select('morning');
    cy.contains('button', 'Continue').click();

    // Step 3: Waste Details Step
    cy.get('input[name="bag_count"]').clear().type('2');
    cy.get('select[name="waste_type"]').select('general');
    cy.contains('button', 'Continue').click();

    // Step 4: Additional Info Step
    cy.contains('Digital Bin Area Photos').should('be.visible');
    // Mock camera functionality and photo capture
    cy.window().then((win) => {
      const mockStream = {
        getTracks: () => [{
          stop: () => {}
        }]
      };
      cy.stub(win.navigator.mediaDevices, 'getUserMedia').resolves(mockStream);
    });
    cy.contains('Take Photos').click();
    // Wait for camera modal and capture photo
    cy.get('.camera-view-container').should('be.visible');
    cy.get('button[aria-label="Capture photo"]').click();
    // Wait for photo capture success toast
    cy.waitForToast('Photo captured successfully', 'success');
    cy.get('button[aria-label="Close camera"]').click();
    // Wait for modal to close
    cy.get('.camera-view-container').should('not.exist');
    // Add notes after modal is closed
    cy.get('#notes').should('be.visible').type('Test notes for Digital Bin');
    cy.contains('button', 'Continue').click();

    // Step 5: Review Step
    cy.contains('Review Your Digital Bin Request').should('be.visible');
    cy.contains('button', 'Submit').click();

    // Verify success toast
    cy.waitForToast('Digital Bin request submitted successfully', 'success');
    // Wait for redirect
    cy.url().should('include', '/digital-bin');
    // Verify QR code tab is shown
    cy.contains('Bin QR Code').should('be.visible').click();
    cy.get('.qr-code-container').should('be.visible');
  });

  it('should handle form validation correctly', () => {
    // Try to proceed without location
    cy.contains('button', 'Continue').click();
    cy.get('#address').should('have.value', '');
    // Check for validation toast
    cy.waitForToast('Please enter an address or select a location', 'error');

    // Enter invalid waste details
    cy.get('#address').type('123 Test Street');
    cy.get('.leaflet-container').click();
    // Wait for location selection success
    cy.waitForToast('Location selected successfully', 'success');
    cy.contains('button', 'Continue').click();

    // Step 2: Schedule Details
    cy.get('select[name="frequency"]').select('weekly');
    cy.get('input[type="date"]').type('2024-02-01');
    cy.get('select[name="preferredTime"]').select('morning');
    cy.contains('button', 'Continue').click();

    // Step 3: Try invalid waste details
    cy.get('input[name="bag_count"]').clear().type('0');
    cy.contains('button', 'Continue').click();
    // Check for validation toast
    cy.waitForToast('Please enter a valid number of bags', 'error');
  });

  it('should handle geolocation errors gracefully', () => {
    // Click 'Get Digital Bin' tab
    cy.contains('button', 'Get Digital Bin').should('be.visible').click({ force: true });

    // Test geolocation error handling
    cy.window().then((win) => {
      cy.stub(win.navigator.geolocation, 'getCurrentPosition').callsFake((success, error) => {
        error({ code: 1, message: 'User denied geolocation' });
      });
    });

    cy.get('#useCurrentLocation').click();
    // Check for geolocation error toast
    cy.waitForToast('Location access denied', 'error');
    // Wait for fallback location to be set
    cy.waitForToast('Using approximate location', 'info');
    cy.get('#address').should('be.visible');
    cy.get('.leaflet-container').should('be.visible');
  });

  it('should handle offline mode correctly', () => {
    // Test offline mode
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'onLine', {
        configurable: true,
        value: false
      });
      // Trigger offline event
      win.dispatchEvent(new Event('offline'));
    });

    // Wait for offline notification
    cy.waitForToast('Working in offline mode', 'warning');

    // Verify form still works offline
    cy.get('#address').should('be.visible').type('123 Test Street');
    cy.get('.leaflet-container').should('be.visible').click();
    cy.waitForToast('Location saved locally', 'info');
    cy.contains('button', 'Continue').click();

    // Complete form in offline mode
    cy.get('select[name="frequency"]').select('weekly');
    cy.get('input[type="date"]').type('2024-02-01');
    cy.get('select[name="preferredTime"]').select('morning');
    cy.contains('button', 'Continue').click();

    // Verify sync message
    cy.waitForToast('Changes will be synced when back online', 'info');

    // Test coming back online
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'onLine', {
        configurable: true,
        value: true
      });
      // Trigger online event
      win.dispatchEvent(new Event('online'));
    });

    // Verify sync notification
    cy.waitForToast('Back online', 'success');
    cy.waitForToast('Syncing changes', 'info');
  });
});
