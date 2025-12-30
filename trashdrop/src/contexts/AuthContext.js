import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import supabase from '../utils/supabaseClient.js';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    session: null,
    user: null,
    loading: true,
    error: null,
    status: 'initializing'
  });
  const initRef = useRef(false);

  const updateAuthState = (updates, includeTimestamp = false) => {
    setAuthState(prev => ({
      ...prev,
      ...updates,
      ...(includeTimestamp ? { lastUpdated: Date.now() } : {})
    }));
  };

  const initializeAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (session) {
        updateAuthState({
          session,
          user: session.user,
          loading: false,
          status: 'authenticated'
        });
      } else {
        updateAuthState({
          session: null,
          user: null,
          loading: false,
          status: 'unauthenticated'
        });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      updateAuthState({
        session: null,
        user: null,
        loading: false,
        error,
        status: 'error'
      });
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      updateAuthState({
        session: data.session,
        user: data.user,
        status: 'authenticated',
        error: null
      }, true);

      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      updateAuthState({
        session: null,
        user: null,
        status: 'error',
        error
      });
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { data, error } = await supabase.auth.signOut();
      if (error) throw error;

      updateAuthState({
        session: null,
        user: null,
        status: 'unauthenticated',
        error: null
      });
    } catch (error) {
      console.error('Sign out error:', error);
      updateAuthState({
        error,
        status: 'error'
      });
    }
  };

  // Initialize auth state
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      initializeAuth();
    }
  }, []);

  // Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN') {
          updateAuthState({
            session,
            user: session.user,
            status: 'authenticated',
            error: null
          });
        } else if (event === 'SIGNED_OUT') {
          updateAuthState({
            session: null,
            user: null,
            status: 'unauthenticated',
            error: null
          });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    ...authState,
    signIn,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
