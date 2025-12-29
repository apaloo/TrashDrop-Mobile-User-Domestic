import React from 'react';

/**
 * Error boundary component to catch and display React errors
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console
    console.error('[ErrorBoundary] React error caught:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Report to debug console if available
    if (window.debugReport) {
      window.debugReport('ErrorBoundary: caught error', {
        error: error.message,
        componentStack: errorInfo.componentStack
      });
    }
    
    // Update global app state if available
    if (window.appState) {
      window.appState.reactErrorBoundary = {
        message: error.message,
        componentStack: errorInfo.componentStack
      };
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          margin: '20px', 
          border: '2px solid #f0ad4e', 
          borderRadius: '8px', 
          backgroundColor: '#fcf8e3'
        }}>
          <h3>Application Error</h3>
          <p>Something went wrong while loading the application.</p>
          <p><strong>Error:</strong> {this.state.error && this.state.error.toString()}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ 
              padding: '8px 16px', 
              margin: '10px 0', 
              backgroundColor: '#4CAF50', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer' 
            }}
          >
            Reload Application
          </button>
          <button
            onClick={() => document.getElementById('debug-console').style.display = 'block'}
            style={{ 
              padding: '8px 16px', 
              margin: '10px 0 10px 10px', 
              backgroundColor: '#f1f1f1', 
              color: '#333', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer' 
            }}
          >
            Show Debug Info
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
