# Debugging Black Screen Issue - TrashDrop Mobile App

**Date:** October 22, 2025  
**Commit:** 3f2519f  
**Issue:** Black screen still appearing after splash screen when app reopens

## Changes Made in This Commit

### 1. Fixed ALL Suspense Fallbacks
Added explicit white backgrounds to prevent ANY black screen appearance:

```javascript
// App.js line 197 - AppContent Suspense
<Suspense fallback={
  <div className="flex justify-center items-center h-screen bg-white">
    <LoadingSpinner size="lg" />
  </div>
}>

// App.js line 345 - Main App Suspense  
<Suspense fallback={
  <div className="flex justify-center items-center h-screen bg-white">
    <LoadingSpinner size="lg" />
  </div>
}>
```

### 2. Added Comprehensive Console Logging

**Initial State Tracking:**
```javascript
console.log('[AuthContext INIT] Checking for stored credentials:', {
  hasStoredUser: !!storedUser,
  hasStoredToken: !!storedToken,
  userEmail: storedUser?.email
});
```

**useEffect Initialization Tracking:**
```javascript
console.log('[Auth useEffect] Initializing authentication...');
console.log('[Auth useEffect] Current auth state:', {
  status: authState.status,
  hasUser: !!authState.user,
  lastAction: authState.lastAction
});
```

---

## Debugging Instructions

### Step 1: Open Developer Console

**On Desktop Browser:**
1. Open Chrome/Edge
2. Press `F12` or `Ctrl+Shift+I` (Windows) or `Cmd+Option+I` (Mac)
3. Go to "Console" tab

**On Mobile Device (Android):**
1. Connect device to computer via USB
2. Open Chrome on computer
3. Navigate to `chrome://inspect`
4. Find your device and click "Inspect"

**On Mobile Device (iOS):**
1. Enable Web Inspector in Safari settings
2. Connect device to Mac
3. Open Safari > Develop > [Your Device]

### Step 2: Reproduce the Issue

1. Log in to the app successfully
2. Verify you can see the homepage
3. Kill the app completely (swipe away or force quit)
4. Reopen the app
5. **Watch the console logs**

### Step 3: Check Console Logs

Look for these log sequences:

**Expected Sequence (Should Work):**
```
[AuthContext INIT] Checking for stored credentials: { hasStoredUser: true, hasStoredToken: true, userEmail: "user@email.com" }
[AuthContext INIT] ✅ Found stored credentials, initializing as AUTHENTICATED
[Auth useEffect] Initializing authentication...
[Auth useEffect] Current auth state: { status: "AUTHENTICATED", hasUser: true, lastAction: "init_with_stored_user" }
[Auth useEffect] Checking stored credentials: { hasStoredUser: true, hasStoredToken: true, userEmail: "user@email.com", currentStatus: "AUTHENTICATED" }
[Auth useEffect] ✅ Found stored credentials, maintaining AUTHENTICATED state during validation
```

**Problem Sequence (Causes Black Screen):**
```
[AuthContext INIT] Checking for stored credentials: { hasStoredUser: false, hasStoredToken: false, userEmail: undefined }
[AuthContext INIT] ❌ No stored credentials, initializing as INITIAL
[Auth useEffect] ❌ No stored credentials, setting LOADING state
```

---

## Potential Causes & Solutions

### Cause 1: Credentials Not Being Stored

**Check localStorage:**
Open Console and type:
```javascript
localStorage.getItem('trashdrop_user')
localStorage.getItem('trashdrop_auth_token')
```

**If both return null:**
- ✅ **Solution:** Credentials aren't being saved during login
- Check `signIn` function in AuthContext.js (line 629-765)
- Verify localStorage.setItem calls are executing

### Cause 2: Credentials Being Cleared

**Check for clearing operations:**
Look for console logs containing:
```
[Auth] Clearing authentication data
[Auth] Removed from localStorage
```

**If you see these:**
- ✅ **Solution:** Something is clearing credentials on app restart
- Check `clearAuthData` function calls
- Look for unintended signOut operations

### Cause 3: Token Validation Failing

**Check for token validation errors:**
Look for console logs containing:
```
[Auth] Invalid or missing token, clearing auth data
[Auth] Stored token is invalid or malformed
```

**If you see these:**
- ✅ **Solution:** Token format might be corrupted
- Check token format: should have 3 parts separated by dots (JWT)
- Verify token isn't being truncated during storage

### Cause 4: Session Storage vs localStorage

**Check storage keys:**
```javascript
// Should be in localStorage, not sessionStorage
localStorage.getItem('trashdrop_user')
localStorage.getItem('trashdrop_auth_token')

// NOT in sessionStorage (gets cleared on app close)
sessionStorage.getItem('trashdrop_user') // Should be null
```

**If data is in sessionStorage:**
- ✅ **Solution:** Change storage location
- SessionStorage clears when app is killed
- Must use localStorage for persistence

### Cause 5: Dark Theme Applying Before White Background

**Check for theme-related console errors:**
Look for:
```
ThemeProvider
ThemeContext
data-theme
```

**If theme is being set:**
- ✅ **Already Fixed:** All loading divs now have `bg-white`
- Should override any theme

---

## Quick Diagnostic Commands

Run these in the console while on the app:

### Check Current Auth State
```javascript
// Check localStorage
console.log('Stored User:', localStorage.getItem('trashdrop_user'));
console.log('Stored Token:', localStorage.getItem('trashdrop_auth_token'));

// Check all storage
console.log('All localStorage:', Object.keys(localStorage).filter(k => k.includes('trash') || k.includes('supabase')));

// Check sessionStorage
console.log('SessionStorage:', Object.keys(sessionStorage));
```

### Check Background Colors
```javascript
// Check body background
console.log('Body BG:', window.getComputedStyle(document.body).backgroundColor);

// Check root background  
console.log('Root BG:', window.getComputedStyle(document.getElementById('root')).backgroundColor);

// Check for theme
console.log('Theme:', document.documentElement.getAttribute('data-theme'));
```

### Force Clear and Re-login
```javascript
// Clear everything
localStorage.clear();
sessionStorage.clear();
location.reload();

// Then log in again and test
```

---

## What to Report Back

Please provide the following information:

### 1. Console Logs
Copy and paste the console logs from app reopen, especially:
- `[AuthContext INIT]` logs
- `[Auth useEffect]` logs
- Any error messages

### 2. localStorage Contents
Run this and share the output:
```javascript
console.log({
  user: localStorage.getItem('trashdrop_user'),
  token: localStorage.getItem('trashdrop_auth_token'),
  allKeys: Object.keys(localStorage)
});
```

### 3. Visual Description
- How long does the black screen last?
- Does it eventually go away?
- Is there a loading spinner visible?
- What color is the spinner background?

### 4. Device/Browser Info
- Device: (iPhone 14, Android Samsung, etc.)
- Browser: (Safari, Chrome, etc.)
- App installed as PWA or browser?

---

## Temporary Workaround

While we debug, you can force the app to work by:

1. Don't kill the app - just minimize it
2. Or clear cache and re-login each time:
   - Settings > Clear Data
   - Log in fresh

---

## Next Steps

Based on your console logs, we'll be able to:
1. Identify exactly where the flow breaks
2. See if credentials are stored/retrieved correctly
3. Determine if it's a storage, theme, or timing issue
4. Apply the appropriate fix

Please share the console logs and we'll get this resolved!
