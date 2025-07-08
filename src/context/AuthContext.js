import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, supabase } from '../utils/supabaseClient';
import appConfig from '../utils/app-config';
import idbUtils from '../utils/indexedDB';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [authRetries, setAuthRetries] = useState(0);
  const [authFallbackNeeded, setAuthFallbackNeeded] = useState(false);
  
  // Function to clear all auth-related storage
  const clearAuthData = () => {
    // Clear Supabase auth data from localStorage
    if (typeof localStorage !== 'undefined') {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-') || 
                   key === appConfig.storage.userKey || 
                   key === appConfig.storage.tokenKey)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      console.log('Cleared authentication data from localStorage');
    }
  };
  
  // Reset auth state function
  const resetAuthState = async () => {
    setUser(null);
    setIsAuthenticated(false);
    clearAuthData();
    await supabase.auth.signOut();
    setAuthRetries(0);
    setAuthFallbackNeeded(true);
    setError('Authentication error occurred. Please sign in again.');
  };
  
  useEffect(() => {
    // Try to load user from localStorage first for immediate UI update
    const storedUser = localStorage.getItem(appConfig.storage.userKey);
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      } catch (e) {
        console.error('Failed to parse stored user data', e);
        clearAuthData();
      }
    }
    
    // Then check with Supabase for session validity
    const checkSession = async () => {
      setIsLoading(true);
      try {
        const { session, error } = await authService.getSession();
        
        if (error) {
          if (error.message && (error.message.includes('invalid JWT') || 
                              error.message.includes('malformed'))) {
            console.warn('JWT token error detected, clearing auth data');
            await resetAuthState();
            return;
          }
          throw error;
        }
        
        if (session) {
          try {
            const { user: currentUser, error: userError } = await authService.getCurrentUser();
            
            if (userError) {
              if (userError.message && (userError.message.includes('invalid JWT') || 
                                       userError.message.includes('malformed'))) {
                console.warn('JWT token error when getting user, clearing auth data');
                await resetAuthState();
                return;
              }
              throw userError;
            }
            
            if (currentUser) {
              setUser(currentUser);
              setIsAuthenticated(true);
              setAuthFallbackNeeded(false);
              // Update localStorage with latest user data
              localStorage.setItem(appConfig.storage.userKey, JSON.stringify(currentUser));
              setError(null);
            } else {
              // No user found despite valid session
              console.warn('No user found despite valid session');
              await resetAuthState();
            }
          } catch (userErr) {
            console.error('Error getting current user:', userErr);
            // Increment retry counter
            if (authRetries < 2) {
              setAuthRetries(prev => prev + 1);
            } else {
              await resetAuthState();
            }
          }
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setAuthFallbackNeeded(true);
          // Clear stored user data if no valid session
          clearAuthData();
        }
      } catch (err) {
        console.error('Auth check error:', err);
        setError(err.message);
        
        // If we've tried multiple times and still have errors, reset auth
        if (authRetries >= 2) {
          await resetAuthState();
        } else {
          setAuthRetries(prev => prev + 1);
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    checkSession();
    
    // Set up auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      if (event === 'SIGNED_IN' && session) {
        checkSession();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        clearAuthData();
      }
    });
    
    return () => {
      if (authListener && authListener.unsubscribe) {
        authListener.unsubscribe();
      }
    };
  }, [authRetries]);

  const signIn = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await authService.signIn(email, password);
      if (error) throw error;
      setUser(data.user);
      setIsAuthenticated(true);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email, password, userData) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await authService.signUp(email, password, userData);
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      const { error } = await authService.signOut();
      if (error) throw error;
      setUser(null);
      setIsAuthenticated(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await authService.resetPassword(email);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    error,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
