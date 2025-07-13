import React, { Component } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Button, Box, Typography, Paper, Container } from '@mui/material';
import { ErrorOutline, Refresh, ExitToApp } from '@mui/icons-material';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Ensure we have a valid error object with a message
    const safeError = error && typeof error === 'object' 
      ? error 
      : new Error(error || 'An unknown authentication error occurred');
    
    return { 
      hasError: true, 
      error: safeError 
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Auth Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container maxWidth="sm" sx={{ mt: 4 }}>
          <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
            <ErrorOutline color="error" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Authentication Error
            </Typography>
            <Typography color="textSecondary" paragraph>
              {this.state.error?.message || 'We encountered an issue with your authentication. This might be due to an expired session or network issues.'}
            </Typography>
            <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Refresh />}
                onClick={() => window.location.reload()}
                fullWidth
              >
                Refresh Page
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<ExitToApp />}
                onClick={this.props.onSignOut}
                fullWidth
              >
                Sign Out & Return to Login
              </Button>
            </Box>
            {process.env.NODE_ENV === 'development' && (
              <Box sx={{ mt: 3, textAlign: 'left', bgcolor: 'background.paper', p: 2, borderRadius: 1, overflowX: 'auto' }}>
                <Typography variant="caption" color="error" component="div" sx={{ mb: 1 }}>
                  Error Details:
                </Typography>
                <pre style={{ 
                  fontSize: '0.75rem', 
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontFamily: 'monospace',
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  padding: '8px',
                  borderRadius: '4px'
                }}>
                  {JSON.stringify({
                    message: this.state.error?.message || 'No error message',
                    name: this.state.error?.name || 'Error',
                    stack: this.state.error?.stack,
                    ...(this.state.error?.status && { status: this.state.error.status }),
                    ...(this.state.error?.code && { code: this.state.error.code })
                  }, null, 2)}
                </pre>
              </Box>
            )}
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

// Wrap the ErrorBoundary with the auth context
const AuthErrorBoundary = ({ children }) => {
  const { signOut } = useAuth();
  
  const handleSignOut = async () => {
    try {
      await signOut();
      // Force a full page reload to ensure clean state
      window.location.href = '/login';
    } catch (error) {
      console.error('Error during sign out:', error);
      window.location.href = '/login';
    }
  };

  return (
    <ErrorBoundary onSignOut={handleSignOut}>
      {children}
    </ErrorBoundary>
  );
};

export default AuthErrorBoundary;
