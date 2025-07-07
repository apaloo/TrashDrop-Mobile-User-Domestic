import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../utils/supabaseClient';
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

  useEffect(() => {
    // Try to load user from localStorage first for immediate UI update
    const storedUser = localStorage.getItem(appConfig.storage.userKey);
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      } catch (e) {
        console.error('Failed to parse stored user data', e);
      }
    }
    
    // Then check with Supabase for session validity
    const checkSession = async () => {
      setIsLoading(true);
      try {
        const { session, error } = await authService.getSession();
        
        if (error) throw error;
        
        if (session) {
          const { user: currentUser } = await authService.getCurrentUser();
          setUser(currentUser);
          setIsAuthenticated(true);
          // Update localStorage with latest user data
          localStorage.setItem(appConfig.storage.userKey, JSON.stringify(currentUser));
        } else {
          setUser(null);
          setIsAuthenticated(false);
          // Clear stored user data if no valid session
          localStorage.removeItem(appConfig.storage.userKey);
          localStorage.removeItem(appConfig.storage.tokenKey);
        }
        setError(null);
      } catch (err) {
        console.error('Auth check error:', err);
        setError(err.message);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkSession();
    
    // Set up auth state change listener
    const { data: authListener } = authService.getSession();
    
    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

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
