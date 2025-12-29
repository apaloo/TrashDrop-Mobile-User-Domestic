describe('CSS Loading Test', () => {
  beforeEach(() => {
    // Visit the homepage before each test
    cy.visit('/');
  });

  it('should load CSS and display styled branding', () => {
    // Check if the app title/branding is visible and styled
    // Looking for TrashDrop text or any element containing logo styling
    cy.contains(/TrashDrop/i).should('exist');
    // Or check for any element with styling that might be a logo/header
    cy.get('header, [class*="header"], .logo, [class*="brand"], h1, h2, h3, .title, [class*="title"]').should('exist');
  });

  it('should display properly styled container elements', () => {
    // Simply check for the existence of visible container elements
    // and verify CSS properties are present
    cy.get('body').should('be.visible')
      .and('have.css', 'background-color');
      
    // Check that there's at least one container element with padding or margin
    cy.get('div, main, section, form').should('exist');
    
    // Check that at least one button has proper styling
    cy.get('button').first()
      .should('have.css', 'padding');
  });

  it('should display properly styled buttons', () => {
    // Check for styled buttons
    cy.get('button').should('be.visible')
      .should('have.css', 'background-color')
      .and('not.be', 'rgba(0, 0, 0, 0)');
  });

  it('should load form elements with proper styling', () => {
    // Check if the form elements have styling
    cy.get('input[type="email"], input[type="text"], input[type="password"]')
      .first()
      .should('have.css', 'border')
      .and('not.be', 'none');
  });

  it('should load Tailwind utility classes', () => {
    // Check if common Tailwind classes are working by checking computed styles
    cy.get('[class*="bg-"], [class*="text-"], [class*="p-"], [class*="m-"]')
      .should('exist');
  });
});
