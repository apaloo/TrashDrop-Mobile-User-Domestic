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

    // Pre-seed auth/session before the app loads to avoid redirects to /login
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'prince02@mailinator.com',
      user_metadata: { name: 'Test User' },
      last_authenticated: new Date().toISOString()
    };
    const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJlbWFpbCI6InByaW5jZTAyQG1haWxpbmF0b3IuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.mockSignature';

    // Load root and seed auth before app boots
    cy.visit('/', {
      onBeforeLoad: (win) => {
        try {
          win.localStorage.setItem('trashdrop_user', JSON.stringify(mockUser));
          win.localStorage.setItem('trashdrop_token', mockJwt);
          // Enable testing/mocks paths used by AuthContext
          win.localStorage.setItem('trashdrop_testing_mode', 'true');
          if (!win.appConfig) {
            win.appConfig = { features: { enableMocks: true }, storage: { userKey: 'trashdrop_user', tokenKey: 'trashdrop_token' } };
          } else {
            win.appConfig.features = { ...(win.appConfig.features || {}), enableMocks: true };
            win.appConfig.storage = { userKey: 'trashdrop_user', tokenKey: 'trashdrop_token' };
          }
        } catch (e) {
          // no-op
        }
      }
    });
    // If on login, perform login via UI to stabilize auth context, then navigate
    cy.location('pathname', { timeout: 30000 }).then((pathname) => {
      if (pathname.includes('/login')) {
        return cy.get('#email', { timeout: 20000 }).should('be.visible').clear().type('prince02@mailinator.com')
          .get('#password', { timeout: 20000 }).should('be.visible').clear().type('sChool@123')
          .get('button[type="submit"]').click()
          .location('pathname', { timeout: 30000 }).should('not.include', '/login');
      }
    }).then(() => {
      // Navigate to Digital Bin
      return cy.visit('/digital-bin').location('pathname', { timeout: 30000 }).should('include', '/digital-bin');
    });

    // Verify seeded auth is present (retry-able)
    cy.window({ timeout: 30000 }).should((win) => {
      const user = win.localStorage.getItem('trashdrop_user');
      const token = win.localStorage.getItem('trashdrop_auth_token') || win.localStorage.getItem('trashdrop_token');
      expect(user, 'mock user in localStorage').to.be.ok;
      expect(token, 'mock token in localStorage').to.be.ok;
    });

    // If app still redirected to /login due to early auth check, perform login and try again
    cy.location('pathname', { timeout: 30000 }).then((pathname) => {
      if (pathname.includes('/login')) {
        return cy.get('#email', { timeout: 20000 }).should('be.visible').clear().type('prince02@mailinator.com')
          .get('#password', { timeout: 20000 }).should('be.visible').clear().type('sChool@123')
          .get('button[type="submit"]').click()
          .location('pathname', { timeout: 30000 }).should('not.include', '/login')
          .visit('/digital-bin')
          .location('pathname', { timeout: 30000 }).should('include', '/digital-bin');
      }
    });

    // If we landed on login UI, perform login now (DOM-based detection)
    cy.get('body', { timeout: 30000 }).then(($body) => {
      const onLogin = $body.find('#email').length && $body.find('button:contains("Sign in")').length;
      if (onLogin) {
        cy.get('#email').clear().type('prince02@mailinator.com');
        cy.get('#password').clear().type('sChool@123');
        cy.get('button[type="submit"]').click();
        cy.location('pathname', { timeout: 30000 }).should('not.include', '/login');
        cy.visit('/digital-bin');
      }
    });

    // Proactively click the Digital Bin tab to reveal the form (works regardless of initial tab)
    cy.get('body').then(($body) => {
      const $btn = $body.find('button:contains("Get Digital Bin")');
      if ($btn.length) {
        cy.wrap($btn[0]).click({ force: true });
      }
    });

    // If the form isn't visible yet, try clicking a likely tab label to reveal it (optional)
    cy.get('body', { timeout: 20000 }).then(($body) => {
      const hasAddress = $body.find('#address').length > 0;
      if (hasAddress) return;
      const labels = ['Get Digital Bin', 'Digital Bin', 'Request Bin', 'Schedule Pickup'];
      const btn = $body.find('button, [role="tab"]').filter((i, el) => {
        const t = (el.textContent || '').trim();
        return labels.some((label) => t.includes(label));
      });
      if (btn.length) {
        cy.wrap(btn[0]).click({ force: true });
      }
    });

    // Now wait for key form elements to ensure UI is ready
    cy.get('#address', { timeout: 30000 }).should('be.visible');
    cy.get('.leaflet-container', { timeout: 30000 }).should('be.visible');
  });

  it('should complete the Digital Bin flow successfully', () => {
    // Step 1: Location Step
    cy.get('#address').should('be.visible').type('123 Test Street');
    cy.get('.leaflet-container').should('be.visible').click();
    cy.contains('button', 'Continue').click();

    // Step 2: Schedule Details Step
    cy.get('select[name="frequency"]').select('weekly');
    cy.get('input[type="date"]').type('2024-02-01');
    cy.get('select[name="preferredTime"]').select('morning');
    cy.contains('button', 'Continue').click();

    // Step 3: Waste Details Step (align with WasteDetailsStep.js UI)
    cy.get('#numberOfBags').select('2');
    cy.get('#waste-general').check();
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
    // Wait for photo capture success toast (matches "Photo X/3 captured successfully")
    cy.waitForToast('captured successfully', 'success');
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
    cy.waitForToast('Digital bin created successfully', 'success');
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
    // Check for inline validation error text under the address input
    cy.contains('p.text-red-500', 'Please enter an address or select a location').should('be.visible');

    // Enter invalid waste details
    cy.get('#address').type('123 Test Street');
    cy.get('.leaflet-container').click();
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
    // Wait for fallback location to be set (app shows info/warning toasts)
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

    // Verify form still works offline
    cy.get('#address').should('be.visible').type('123 Test Street');
    cy.get('.leaflet-container').should('be.visible').click();
    cy.contains('button', 'Continue').click();

    // Complete form in offline mode
    cy.get('select[name="frequency"]').select('weekly');
    cy.get('input[type="date"]').type('2024-02-01');
    cy.get('select[name="preferredTime"]').select('morning');
    cy.contains('button', 'Continue').click();

    // Test coming back online
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'onLine', {
        configurable: true,
        value: true
      });
      // Trigger online event
      win.dispatchEvent(new Event('online'));
    });
  });
});
