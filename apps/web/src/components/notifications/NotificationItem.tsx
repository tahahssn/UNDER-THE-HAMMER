import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { NotificationDto } from '../../hooks/useNotifications';

interface NotificationItemProps {
  notification: NotificationDto;
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  BID_WON: { bg: 'bg-blue-100', text: 'text-blue-700' },
  BID_PLACED: { bg: 'bg-green-100', text: 'text-green-700' },
  BREAK_STARTED: { bg: 'bg-amber-100', text: 'text-amber-700' },
  BREAK_ENDED: { bg: 'bg-amber-50', text: 'text-amber-600' },
  AUCTION_ENDED: { bg: 'bg-purple-100', text: 'text-purple-700' },
  SUBSCRIPTION_EXPIRING: { bg: 'bg-red-100', text: 'text-red-700' },
};

export function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: NotificationItemProps) {
  const colors = categoryColors[notification.category] || {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
  };

  const relativeTime = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
  });

  const truncatedBody =
    notification.body && notification.body.length > 100
      ? `${notification.body.substring(0, 100)}...`
      : notification.body;

  return (
    <div
      className={`flex gap-3 p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors ${
        !notification.read ? 'bg-blue-50' : ''
      }`}
      onClick={() => onMarkRead?.(notification.id)}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        {/* Category badge */}
        <div
          className={`inline-block px-2 py-1 text-xs font-semibold rounded mb-1 ${colors.bg} ${colors.text}`}
        >
          {notification.category.replace(/_/g, ' ')}
        </div>

        {/* Title */}
        <p className="font-semibold text-gray-900 truncate">{notification.title}</p>

        {/* Body */}
        {truncatedBody && (
          <p className="text-sm text-gray-600 line-clamp-2">{truncatedBody}</p>
        )}

        {/* Timestamp */}
        <p className="text-xs text-gray-500 mt-1">{relativeTime}</p>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(notification.id);
        }}
        className="p-1 text-gray-400 hover:text-red-600 flex-shrink-0"
        title="Delete notification"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
