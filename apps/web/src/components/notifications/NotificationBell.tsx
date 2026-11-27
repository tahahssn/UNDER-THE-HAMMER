import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationDropdown } from './NotificationDropdown';

/**
 * NotificationBell component displays a bell icon with unread count badge
 * and opens a dropdown showing recent notifications on click.
 */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    loading,
    error,
    markAsRead,
    deleteNotification,
    unreadCount,
  } = useNotifications(5);

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative transition-colors cursor-pointer"
        aria-label="Notifications"
        title="Notifications"
      >
        {/* Bell SVG Icon (Heroicons/Lucide style) */}
        <svg
          className="w-6 h-6 text-gray-600 dark:text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.div>
        )}
      </button>

      {/* Notification Dropdown */}
      <NotificationDropdown
        notifications={notifications}
        loading={loading}
        error={error}
        onMarkRead={markAsRead}
        onDelete={deleteNotification}
        onClose={() => setIsOpen(false)}
        isOpen={isOpen}
      />
    </div>
  );
}
