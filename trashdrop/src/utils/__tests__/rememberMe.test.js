import { applyRememberMe, endSessionIfNotRemembered, rememberedSignIn } from '../rememberMe';

const signedIn = () => {
  localStorage.setItem('sb-abc-auth-token', '{"access_token":"x"}');
  localStorage.setItem('trashdrop_auth_token', 'x');
  localStorage.setItem('trashdrop_user', '{}');
};
const isSignedIn = () => !!localStorage.getItem('sb-abc-auth-token');
// A closed app or tab: sessionStorage is cleared, localStorage stays
const closeApp = () => sessionStorage.clear();

describe('Remember me', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('starts ticked with no email the first time', () => {
    expect(rememberedSignIn()).toEqual({ email: '', remember: true });
  });

  it('ticked: keeps the session after the app closes and fills in the email', () => {
    applyRememberMe(true, ' ama@example.com ');
    signedIn();
    closeApp();
    expect(endSessionIfNotRemembered()).toBe(false);
    expect(isSignedIn()).toBe(true);
    expect(rememberedSignIn()).toEqual({ email: 'ama@example.com', remember: true });
  });

  it('not ticked: keeps the session while open, signs out once the app was closed', () => {
    applyRememberMe(false, 'ama@example.com');
    signedIn();
    expect(endSessionIfNotRemembered()).toBe(false); // a reload
    expect(isSignedIn()).toBe(true);
    closeApp();
    expect(endSessionIfNotRemembered()).toBe(true);
    expect(isSignedIn()).toBe(false);
    expect(localStorage.getItem('trashdrop_auth_token')).toBeNull();
    expect(localStorage.getItem('trashdrop_user')).toBeNull();
    // Next time the box is shown as they left it
    expect(rememberedSignIn()).toEqual({ email: '', remember: false });
    // Signing in again while the app is open is kept until it closes
    applyRememberMe(false);
    signedIn();
    expect(endSessionIfNotRemembered()).toBe(false);
    expect(isSignedIn()).toBe(true);
  });

  it('not ticked forgets an email remembered earlier, and shows the box unticked', () => {
    applyRememberMe(true, 'ama@example.com');
    applyRememberMe(false, 'ama@example.com');
    expect(rememberedSignIn()).toEqual({ email: '', remember: false });
  });

  it('leaves other saved settings alone', () => {
    localStorage.setItem('trashdrop_theme', 'dark');
    applyRememberMe(false);
    signedIn();
    closeApp();
    endSessionIfNotRemembered();
    expect(localStorage.getItem('trashdrop_theme')).toBe('dark');
  });
});
