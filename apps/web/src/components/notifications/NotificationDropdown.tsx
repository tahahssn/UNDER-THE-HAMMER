import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { NotificationItem } from './NotificationItem';
import { NotificationDto } from '../../hooks/useNotifications';

interface NotificationDropdownProps {
  notifications: NotificationDto[];
  loading: boolean;
  error: string | null;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function NotificationDropdown({
  notifications,
  loading,
  error,
  onMarkRead,
  onDelete,
  onClose,
  isOpen,
}: NotificationDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on escape key or outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white rounded-lg shadow-lg border border-gray-200 z-50"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Notifications</h3>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="px-4 py-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {error && (
          <div className="px-4 py-4 bg-red-50 border-b border-red-200">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-sm font-semibold text-red-700 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500">No notifications</p>
          </div>
        )}

        {!loading &&
          !error &&
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={onMarkRead}
              onDelete={onDelete}
            />
          ))}
      </div>

      {/* Footer */}
      {!loading && !error && notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <Link
            href="/account/notifications"
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            View all notifications →
          </Link>
        </div>
      )}
    </div>
  );
}
