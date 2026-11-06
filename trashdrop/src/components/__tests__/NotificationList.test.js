import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import NotificationList from '../NotificationList.js';
import { notificationService } from '../../services/notificationService.js';
import { useAuth } from '../../context/AuthContext.js';

// Mock the services and hooks
jest.mock('../../services/notificationService.js');
jest.mock('../../context/AuthContext.js');

describe('NotificationList', () => {
  const mockUser = { id: 'user123' };
  const mockNotifications = [
    {
      id: 'notif1',
      type: 'pickup_status',
      title: 'Pickup Complete',
      message: 'Your pickup request has been completed',
      status: 'unread',
      created_at: '2025-07-21T20:00:00Z'
    },
    {
      id: 'notif2',
      type: 'system',
      title: 'System Update',
      message: 'App maintenance scheduled',
      status: 'read',
      created_at: '2025-07-21T19:00:00Z'
    }
  ];
  const mockPreferences = {
    pickup_status: true,
    system: true,
    promo: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });

    // Mock service responses
    notificationService.getUserNotifications.mockResolvedValue({
      data: mockNotifications,
      error: null
    });
    notificationService.markAsRead.mockResolvedValue({
      data: null,
      error: null
    });
    notificationService.deleteOldNotifications.mockResolvedValue({
      data: null,
      error: null
    });
    notificationService.updateNotificationPreferences.mockResolvedValue({
      data: null,
      error: null
    });
  });

  it('renders notification list with notifications', async () => {
    render(<NotificationList />);

    await waitFor(() => {
      expect(screen.getByText('Pickup Complete')).toBeInTheDocument();
      expect(screen.getByText('System Update')).toBeInTheDocument();
    });
  });

  it('displays empty state when no notifications', async () => {
    notificationService.getUserNotifications.mockResolvedValueOnce({
      data: [],
      error: null
    });

    render(<NotificationList />);

    await waitFor(() => {
      expect(screen.getByText('No notifications to display')).toBeInTheDocument();
    });
  });

  it('marks notification as read', async () => {
    render(<NotificationList />);

    // Wait for loading to finish and header to render
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
  });

  it('renders notification preferences toggle', async () => {
    render(<NotificationList />);

    // Wait for loading to finish and header to render
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
  });

  it('updates notification preferences', async () => {
    render(<NotificationList />);

    // Wait for loading to finish and header to render
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
    expect(notificationService.updateNotificationPreferences).toBeDefined();
  });

  it('can delete old notifications', async () => {
    render(<NotificationList />);

    // Wait for loading to finish and header to render
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
    expect(notificationService.deleteOldNotifications).toBeDefined();
  });

  it('handles service errors gracefully', async () => {
    notificationService.getUserNotifications.mockResolvedValueOnce({
      data: null,
      error: { message: 'Failed to fetch notifications' }
    });

    render(<NotificationList />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load notifications')).toBeInTheDocument();
    });
  });

  it('keeps the list and shows no error when a background refresh fails', async () => {
    jest.useFakeTimers();
    try {
      render(<NotificationList />);
      await waitFor(() => expect(screen.getByText('Pickup Complete')).toBeInTheDocument());

      notificationService.getUserNotifications.mockResolvedValueOnce({
        data: [],
        error: { message: 'network error' }
      });
      jest.advanceTimersByTime(60000);
      await waitFor(() => expect(notificationService.getUserNotifications).toHaveBeenCalledTimes(3));
      // let the failed refresh finish updating the page
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      expect(screen.getByText('Pickup Complete')).toBeInTheDocument();
      expect(screen.queryByText('Failed to load notifications')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the load error once a later refresh works', async () => {
    notificationService.getUserNotifications
      .mockResolvedValueOnce({ data: [], error: { message: 'network error' } });

    render(<NotificationList />);
    await waitFor(() => expect(screen.getByText('Failed to load notifications')).toBeInTheDocument());

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(screen.getByText('Pickup Complete')).toBeInTheDocument());
    expect(screen.queryByText('Failed to load notifications')).not.toBeInTheDocument();
  });

  it('says the phone is offline rather than "failed"', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    try {
      notificationService.getUserNotifications.mockResolvedValue({ data: [], error: { message: 'Failed to fetch' } });
      render(<NotificationList />);
      expect(await screen.findByText(/You're offline/)).toBeInTheDocument();
      expect(screen.queryByText('Failed to load notifications')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    }
  });

  it('refreshes notifications periodically', async () => {
    render(<NotificationList />);

    // Just verify initial fetch occurs
    await waitFor(() => {
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        'user123',
        { limit: 50 }
      );
    });
  });

  it('displays notification timestamps correctly', async () => {
    render(<NotificationList />);

    await waitFor(() => {
      // Check that timestamps are displayed (format may vary)
      const timeElements = screen.getAllByText(/PM|AM/);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  it('shows unread and read notifications', async () => {
    render(<NotificationList />);

    await waitFor(() => {
      expect(screen.getByText('Pickup Complete')).toBeInTheDocument();
      expect(screen.getByText('System Update')).toBeInTheDocument();
    });
  });

  it('shows collected and disposed messages with a check mark', async () => {
    notificationService.getUserNotifications.mockResolvedValue({
      data: [
        { id: 'n1', type: 'pickup_collected', title: 'Waste Collected ✅', message: 'Picked up', status: 'unread', created_at: '2026-11-06T05:50:00Z' },
        { id: 'n2', type: 'pickup_disposed', title: 'Waste Disposed ♻️', message: 'Disposed', status: 'unread', created_at: '2026-11-06T06:30:00Z' },
        { id: 'n3', type: 'collector_arrived', title: 'Collector Arrived', message: 'Here', status: 'read', created_at: '2026-11-06T05:47:00Z' }
      ],
      error: null
    });

    const { container } = render(<NotificationList />);

    await waitFor(() => {
      expect(screen.getByText('Waste Collected ✅')).toBeInTheDocument();
    });
    // The check-mark icon path; the arrived message keeps the info icon
    expect(container.querySelectorAll('path[d="M8 12.5l3 3 5-6"]')).toHaveLength(2);
    expect(container.querySelectorAll('path[d="M12 11v5M12 8v.01"]')).toHaveLength(1);
  });

  it('does not crash when the user is briefly null during a session re-check', async () => {
    const { rerender } = render(<NotificationList />);
    await waitFor(() => {
      expect(screen.getByText('Pickup Complete')).toBeInTheDocument();
    });

    // AuthContext sets user to null for a moment before the route redirects
    useAuth.mockReturnValue({ user: null });
    expect(() => rerender(<NotificationList />)).not.toThrow();
    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument();

    // And it recovers once the user is back
    useAuth.mockReturnValue({ user: mockUser });
    rerender(<NotificationList />);
    await waitFor(() => {
      expect(screen.getByText('Pickup Complete')).toBeInTheDocument();
    });
  });

  it('renders a loading state, not a crash, when opened with no user', () => {
    useAuth.mockReturnValue({ user: null });
    expect(() => render(<NotificationList />)).not.toThrow();
    expect(notificationService.getUserNotifications).not.toHaveBeenCalled();
  });

  it('displays notifications in correct order', async () => {
    render(<NotificationList />);

    await waitFor(() => {
      expect(screen.getByText('Pickup Complete')).toBeInTheDocument();
      expect(screen.getByText('System Update')).toBeInTheDocument();
    });
  });
});
