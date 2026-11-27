import { useEffect, useState, useCallback } from 'react';

export interface NotificationDto {
  id: string;
  userId: string;
  category: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  data: NotificationDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export function useNotifications(limit: number = 5) {
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/notifications?page=1&limit=${limit}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.statusText}`);
      }

      const data: NotificationsResponse = await response.json();
      setNotifications(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch(`/api/v1/notifications/${notificationId}/mark-read`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to mark notification as read');
        }

        // Update local state
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [],
  );

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch(`/api/v1/notifications/${notificationId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to delete notification');
        }

        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [],
  );

  return {
    notifications,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    deleteNotification,
    unreadCount: notifications.filter((n) => !n.read).length,
  };
}
