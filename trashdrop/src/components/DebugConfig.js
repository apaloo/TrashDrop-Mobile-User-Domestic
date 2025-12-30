import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Collapse,
  IconButton,
  CircularProgress,
  Alert,
  Switch,
  FormControlLabel,
  Divider
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  CloudOff,
  CloudDone,
  NetworkCheck,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext.js';
import appConfig from '../utils/app-config.js';
import { runConnectionTest } from '../utils/testSupabaseConnection.js';
import networkMonitor from '../utils/networkMonitor.js';

const DebugConfig = () => {
  const { authState = {} } = useAuth() || {};
  const [expanded, setExpanded] = React.useState(false);
  const [networkMonitoring, setNetworkMonitoring] = React.useState(false);
  const [showNetworkLogs, setShowNetworkLogs] = React.useState(false);
  const [connectionTest, setConnectionTest] = React.useState({
    loading: false,
    result: null,
    error: null,
    timestamp: null
  });
  
  const handleTestConnection = async () => {
    setConnectionTest(prev => ({ ...prev, loading: true }));
    try {
      const result = await runConnectionTest();
      setConnectionTest({
        loading: false,
        result,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      setConnectionTest({
        loading: false,
        result: null,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date().toISOString()
      });
    }
  };
  
  // Get environment variables (without exposing sensitive data)
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    REACT_APP_ENV: process.env.REACT_APP_ENV,
    REACT_APP_VERSION: process.env.REACT_APP_VERSION,
    REACT_APP_SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL 
      ? `${process.env.REACT_APP_SUPABASE_URL.substring(0, 20)}...` 
      : 'Not set',
    REACT_APP_SUPABASE_ANON_KEY: process.env.REACT_APP_SUPABASE_ANON_KEY 
      ? `${process.env.REACT_APP_SUPABASE_ANON_KEY.substring(0, 10)}...${process.env.REACT_APP_SUPABASE_ANON_KEY.substring(-4)}` 
      : 'Not set',
  };
  
  // Get localStorage keys
  const storageKeys = (() => {
    if (typeof localStorage === 'undefined') return [];
    return Object.keys(localStorage).filter(key => 
      key.includes('supabase') || 
      key.includes('sb-') ||
      key === appConfig.storage.userKey ||
      key === appConfig.storage.tokenKey
    );
  })();
  
  // Format localStorage data (without sensitive values)
  const storageData = storageKeys.reduce((acc, key) => {
    try {
      const value = localStorage.getItem(key);
      let displayValue = value;
      
      // Handle large values or sensitive data
      if (value && value.length > 50) {
        displayValue = `${value.substring(0, 30)}...${value.substring(-10)}`;
      }
      
      // Don't show full tokens or keys
      if (key.includes('token') || key.includes('key') || key.includes('secret')) {
        displayValue = '***';
      }
      
      acc[key] = displayValue;
    } catch (e) {
      acc[key] = 'Error reading value';
    }
    return acc;
  }, {});
  
  // Toggle network monitoring
  const toggleNetworkMonitoring = React.useCallback(() => {
    if (networkMonitoring) {
      networkMonitor.stop();
      setShowNetworkLogs(false);
    } else {
      networkMonitor.start();
      setShowNetworkLogs(true);
    }
    setNetworkMonitoring(!networkMonitoring);
  }, [networkMonitoring]);

  // Toggle network logs visibility
  const toggleNetworkLogs = React.useCallback(() => {
    if (showNetworkLogs) {
      setShowNetworkLogs(false);
    } else {
      // Show the latest network logs when opening the panel
      networkMonitor.logRequests({ supabaseOnly: true });
      setShowNetworkLogs(true);
    }
  }, [showNetworkLogs]);

  // Clean up network monitoring on unmount
  React.useEffect(() => {
    return () => {
      if (networkMonitoring) {
        networkMonitor.stop();
      }
    };
  }, [networkMonitoring]);

  // Determine connection status
  const connectionStatus = React.useMemo(() => {
    if (connectionTest.loading) return 'testing';
    if (connectionTest.error) return 'error';
    if (connectionTest.result?.success) return 'connected';
    return 'disconnected';
  }, [connectionTest]);

  const statusColors = {
    testing: 'text.warning',
    connected: 'success.main',
    error: 'error.main',
    disconnected: 'text.secondary'
  };
  
  const statusIcons = {
    testing: <CircularProgress size={16} color="warning" />,
    connected: <CloudDone color="success" fontSize="small" />,
    error: <CloudOff color="error" fontSize="small" />,
    disconnected: <CloudOff color="disabled" fontSize="small" />
  };

  return (
    <Box sx={{ 
      position: 'fixed', 
      bottom: 0, 
      right: 0, 
      zIndex: 9999,
      maxWidth: '400px',
      width: '100%',
      p: 1
    }}>
      <Paper elevation={3} sx={{ p: 2, bgcolor: 'background.paper' }}>
        <Box 
          display="flex" 
          justifyContent="space-between" 
          alignItems="center"
          onClick={() => setExpanded(!expanded)}
          sx={{ cursor: 'pointer' }}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="subtitle2" fontWeight="bold">
              Debug Info {expanded ? '' : '...'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto' }}>
              {statusIcons[connectionStatus]}
              <Typography 
                variant="caption" 
                sx={{ 
                  ml: 0.5, 
                  color: statusColors[connectionStatus],
                  fontWeight: 'medium'
                }}
              >
                {connectionStatus.toUpperCase()}
              </Typography>
            </Box>
          </Box>
          <IconButton size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>
        
        <Collapse in={expanded}>
          <Box sx={{ mt: 1 }}>
            {connectionTest.error && (
              <Alert 
                severity="error" 
                sx={{ mb: 2, '& .MuiAlert-message': { width: '100%' } }}
              >
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Connection Error</Typography>
                  <Typography variant="caption" component="div">
                    {connectionTest.error.message}
                  </Typography>
                  {connectionTest.result?.status && (
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      Status: {connectionTest.result.status}
                    </Typography>
                  )}
                </Box>
              </Alert>
            )}
            
            <Typography variant="caption" display="block" fontWeight="bold" gutterBottom>
              Environment
              {connectionTest.timestamp && (
                <Typography 
                  component="span" 
                  variant="caption" 
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  (Tested: {new Date(connectionTest.timestamp).toLocaleTimeString()})
                </Typography>
              )}
            </Typography>
            <Box component="pre" sx={{ 
              fontSize: '0.7rem', 
              overflowX: 'auto',
              bgcolor: 'rgba(0,0,0,0.05)',
              p: 1,
              borderRadius: 1,
              mb: 2
            }}>
              {JSON.stringify(env, null, 2)}
            </Box>
            
            <Typography variant="caption" display="block" fontWeight="bold" gutterBottom>
              Auth State
            </Typography>
            <Box component="pre" sx={{ 
              fontSize: '0.7rem', 
              overflowX: 'auto',
              bgcolor: 'rgba(0,0,0,0.05)',
              p: 1,
              borderRadius: 1,
              mb: 2,
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {JSON.stringify({
                status: authState?.status || 'unknown',
                isAuthenticated: authState?.status === 'authenticated' || false,
                user: authState?.user ? { 
                  id: authState.user.id, 
                  email: authState.user.email,
                  // Add other non-sensitive user fields as needed
                } : null,
                lastAction: authState?.lastAction || 'none',
                retryCount: authState?.retryCount || 0,
                error: authState?.error ? {
                  message: authState.error.message,
                  code: authState.error.code,
                  isRecoverable: authState.error.isRecoverable
                } : null
              }, null, 2)}
            </Box>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" display="block" fontWeight="bold" gutterBottom>
                Network Monitoring
              </Typography>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={networkMonitoring}
                      onChange={toggleNetworkMonitoring}
                      color="primary"
                    />
                  }
                  label={
                    <Box display="flex" alignItems="center">
                      <NetworkCheck fontSize="small" sx={{ mr: 0.5 }} />
                      <Typography variant="caption">
                        Monitor Network
                      </Typography>
                    </Box>
                  }
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={toggleNetworkLogs}
                  startIcon={showNetworkLogs ? <VisibilityOff /> : <Visibility />}
                  disabled={!networkMonitoring}
                >
                  {showNetworkLogs ? 'Hide Logs' : 'Show Logs'}
                </Button>
              </Box>
              
              {showNetworkLogs && networkMonitoring && (
                <Box sx={{ 
                  bgcolor: 'rgba(0,0,0,0.05)', 
                  p: 1, 
                  borderRadius: 1,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  mb: 2
                }}>
                  {networkMonitor.getRequests({ supabaseOnly: true }).length > 0 ? (
                    networkMonitor.getRequests({ supabaseOnly: true }).map((req, index) => (
                      <Box key={index} sx={{ 
                        mb: 1, 
                        p: 1, 
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        borderLeft: `3px solid ${
                          req.status === 'error' ? '#f44336' : 
                          req.response?.status >= 400 ? '#ff9800' : '#4caf50'
                        }`
                      }}>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="caption" fontWeight="bold">
                            {req.method} {req.status}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {req.duration ? `${req.duration}ms` : ''}
                          </Typography>
                        </Box>
                        <Typography variant="caption" component="div" noWrap sx={{ 
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {req.url}
                        </Typography>
                        {req.response && (
                          <Typography variant="caption" color="text.secondary">
                            Status: {req.response.status} {req.response.statusText}
                          </Typography>
                        )}
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No network requests captured yet
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="caption" display="block" fontWeight="bold" gutterBottom>
              Storage ({storageKeys.length} items)
            </Typography>
            <Box component="pre" sx={{ 
              fontSize: '0.7rem', 
              overflowX: 'auto',
              bgcolor: 'rgba(0,0,0,0.05)',
              p: 1,
              borderRadius: 1,
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {Object.keys(storageData).length > 0 
                ? JSON.stringify(storageData, null, 2)
                : 'No auth-related storage items found'}
            </Box>
            
            <Box display="flex" justifyContent="space-between" mt={1} gap={1}>
              <Box>
                <Button 
                  size="small" 
                  variant="outlined" 
                  color="primary"
                  onClick={handleTestConnection}
                  disabled={connectionTest.loading}
                  startIcon={connectionTest.loading ? <CircularProgress size={16} /> : null}
                >
                  Test Connection
                </Button>
              </Box>
              <Box>
                <Button 
                  size="small" 
                  variant="outlined" 
                  color="secondary"
                  onClick={() => window.location.reload()}
                  sx={{ mr: 1 }}
                >
                  Refresh
                </Button>
                {process.env.NODE_ENV === 'development' && (
                  <Button 
                    size="small" 
                    variant="outlined" 
                    color="error"
                    onClick={() => {
                      if (window.confirm('Clear all auth data and reload?')) {
                        Object.keys(storageData).forEach(key => {
                          localStorage.removeItem(key);
                        });
                        window.location.reload();
                      }
                    }}
                  >
                    Clear Auth
                  </Button>
                )}
              </Box>
            </Box>
          </Box>
        </Collapse>
      </Paper>
    </Box>
  );
};

export default DebugConfig;
