import React, { useState, useEffect } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Typography,
  Box,
  Paper,
  Switch,
  FormGroup,
  FormControlLabel,
  Divider,
  Badge,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  NotificationsOutlined,
  CheckCircleOutline,
  ErrorOutline,
  InfoOutlined,
  DeleteOutline,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext.js';
import { notificationService } from '../services/notificationService.js';

const NotificationList = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    pickup_status: true,
    system: true,
    promo: true
  });

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data, error: fetchError } = await notificationService.getUserNotifications(
          user.id,
          { limit: 50 }
        );

        if (fetchError) throw new Error(fetchError.message);
        setNotifications(data);

      } catch (err) {
        console.error('Error fetching notifications:', err);
        setError('Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
    // Refresh notifications every minute
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [user.id]);

  // Fetch user preferences
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const { data: profile } = await notificationService.getUserNotifications(user.id);
        if (profile?.notification_preferences) {
          setPreferences(prev => ({
            ...prev,
            ...profile.notification_preferences
          }));
        }
      } catch (err) {
        console.error('Error fetching preferences:', err);
      }
    };

    fetchPreferences();
  }, [user.id]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await notificationService.markAsRead(user.id, [notificationId]);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, status: 'read' } : n
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError('Failed to mark notification as read');
    }
  };

  const handleDeleteOld = async () => {
    try {
      await notificationService.deleteOldNotifications(user.id, 30); // Delete notifications older than 30 days
      setNotifications(prev =>
        prev.filter(n => {
          const age = (Date.now() - new Date(n.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return age <= 30;
        })
      );
    } catch (err) {
      console.error('Error deleting old notifications:', err);
      setError('Failed to delete old notifications');
    }
  };

  const handlePreferenceChange = async (type) => {
    const newPreferences = {
      ...preferences,
      [type]: !preferences[type]
    };
    
    try {
      await notificationService.updateNotificationPreferences(user.id, newPreferences);
      setPreferences(newPreferences);
    } catch (err) {
      console.error('Error updating preferences:', err);
      setError('Failed to update notification preferences');
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'pickup_status':
        return <CheckCircleOutline color="primary" />;
      case 'error':
        return <ErrorOutline color="error" />;
      default:
        return <InfoOutlined color="info" />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          Notifications
        </Typography>
        <Box>
          <IconButton onClick={() => setShowPreferences(!showPreferences)}>
            <Badge color="primary" variant="dot" invisible={!showPreferences}>
              <SettingsIcon />
            </Badge>
          </IconButton>
          <IconButton onClick={handleDeleteOld}>
            <DeleteOutline />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {showPreferences && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Notification Preferences
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.pickup_status}
                  onChange={() => handlePreferenceChange('pickup_status')}
                />
              }
              label="Pickup Status Updates"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.system}
                  onChange={() => handlePreferenceChange('system')}
                />
              }
              label="System Notifications"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.promo}
                  onChange={() => handlePreferenceChange('promo')}
                />
              }
              label="Promotional Messages"
            />
          </FormGroup>
        </Paper>
      )}

      <Paper>
        {notifications.length > 0 ? (
          <List>
            {notifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                {index > 0 && <Divider />}
                <ListItem
                  sx={{
                    bgcolor: notification.status === 'unread' ? 'action.hover' : 'inherit',
                    transition: 'background-color 0.2s'
                  }}
                  secondaryAction={
                    notification.status === 'unread' && (
                      <IconButton
                        edge="end"
                        onClick={() => handleMarkAsRead(notification.id)}
                      >
                        <CheckCircleOutline />
                      </IconButton>
                    )
                  }
                >
                  <ListItemIcon>
                    {getNotificationIcon(notification.type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={notification.title}
                    secondary={
                      <>
                        <Typography variant="body2" component="span" display="block">
                          {notification.message}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(notification.created_at).toLocaleString()}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        ) : (
          <Box p={3} textAlign="center">
            <NotificationsOutlined sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography color="text.secondary">
              No notifications to display
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default NotificationList;
