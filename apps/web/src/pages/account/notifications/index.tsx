import React, { useState } from 'react';
import { useNotifications } from '../../../hooks/useNotifications';

export default function NotificationsPage() {
  const { notifications, loading, error, fetchNotifications, markAsRead, deleteNotification } =
    useNotifications(20);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const categories = [
    'BID_WON',
    'BID_PLACED',
    'BREAK_STARTED',
    'BREAK_ENDED',
    'AUCTION_ENDED',
    'SUBSCRIPTION_EXPIRING',
  ];

  const filteredNotifications = selectedCategory
    ? notifications.filter((n) => n.category === selectedCategory)
    : notifications;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newIds = new Set(selectedIds);
    if (checked) {
      newIds.add(id);
    } else {
      newIds.delete(id);
    }
    setSelectedIds(newIds);
  };

  const handleMarkSelectedAsRead = async () => {
    for (const id of selectedIds) {
      await markAsRead(id);
    }
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} notifications?`)) return;
    for (const id of selectedIds) {
      await deleteNotification(id);
    }
    setSelectedIds(new Set());
  };

  if (loading && notifications.length === 0) {
    return <div className="p-8 text-center">Loading notifications...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Notifications</h1>

      {/* Filter */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Filter by category:</label>
        <select
          value={selectedCategory || ''}
          onChange={(e) => setSelectedCategory(e.target.value || null)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">All</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">
            {selectedIds.size} notification{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="space-x-3">
            <button
              onClick={handleMarkSelectedAsRead}
              className="px-3 py-1 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Mark as Read
            </button>
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 text-sm font-medium bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg">
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchNotifications}
            className="mt-2 text-sm font-medium text-red-700 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No notifications</p>
        </div>
      ) : (
        <div className="space-y-2 border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-50 px-4 py-3 border-b flex items-center space-x-4">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="rounded"
            />
            <div className="flex-1">Category</div>
            <div className="w-1/3">Title</div>
            <div className="w-1/4">Time</div>
          </div>

          {/* Rows */}
          {filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`px-4 py-3 border-b flex items-center space-x-4 hover:bg-gray-50 ${
                !notification.read ? 'bg-blue-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(notification.id)}
                onChange={(e) => handleSelectOne(notification.id, e.target.checked)}
                className="rounded"
              />
              <div className="flex-1">
                <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-700">
                  {notification.category.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="w-1/3 truncate">{notification.title}</div>
              <div className="w-1/4 text-sm text-gray-500">
                {new Date(notification.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
