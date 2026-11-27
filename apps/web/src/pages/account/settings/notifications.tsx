import React, { useState } from 'react';
import { useNotificationPreferences } from '../../../hooks/useNotificationPreferences';

export default function NotificationPreferencesPage() {
  const { preferences, loading, updating, error, updatePreference } =
    useNotificationPreferences();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleToggle = async (
    category: string,
    channel: 'inApp' | 'email' | 'sms',
    newValue: boolean,
  ) => {
    const pref = preferences.find((p) => p.category === category);
    if (!pref) return;

    const updatedChannels = {
      inApp: pref.channels.inApp.enabled,
      email: pref.channels.email.enabled,
      sms: pref.channels.sms.enabled,
      [channel]: newValue,
    };

    const success = await updatePreference(category, updatedChannels);
    if (success) {
      setSuccessMessage(`Preferences updated for ${category}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading preferences...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Notification Preferences</h1>
      <p className="text-gray-600 mb-6">
        Choose how you want to receive notifications for different events.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg">
          <p className="text-green-700">{successMessage}</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {/* Table Header */}
        <div className="grid grid-cols-5 gap-4 px-6 py-4 border-b bg-gray-50 font-semibold">
          <div>Notification Type</div>
          <div className="text-center">In-App</div>
          <div className="text-center">Email</div>
          <div className="text-center">SMS</div>
          <div className="text-center">Status</div>
        </div>

        {/* Rows */}
        {preferences.map((pref) => (
          <div key={pref.category} className="grid grid-cols-5 gap-4 px-6 py-4 border-b items-center">
            <div>
              <div className="font-medium">{pref.category.replace(/_/g, ' ')}</div>
            </div>

            {/* In-App Toggle */}
            <div className="flex justify-center">
              <button
                onClick={() =>
                  handleToggle(pref.category, 'inApp', !pref.channels.inApp.enabled)
                }
                disabled={updating}
                className={`w-10 h-6 rounded-full transition-colors ${
                  pref.channels.inApp.enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    pref.channels.inApp.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Email Toggle */}
            <div className="flex justify-center">
              <button
                onClick={() =>
                  handleToggle(pref.category, 'email', !pref.channels.email.enabled)
                }
                disabled={updating}
                className={`w-10 h-6 rounded-full transition-colors ${
                  pref.channels.email.enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    pref.channels.email.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* SMS Toggle */}
            <div className="flex justify-center">
              <button
                onClick={() =>
                  handleToggle(pref.category, 'sms', !pref.channels.sms.enabled)
                }
                disabled={updating}
                className={`w-10 h-6 rounded-full transition-colors ${
                  pref.channels.sms.enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    pref.channels.sms.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Status */}
            <div className="text-center text-sm text-gray-500">
              {pref.channels.inApp.enabled ||
              pref.channels.email.enabled ||
              pref.channels.sms.enabled
                ? 'Enabled'
                : 'Disabled'}
            </div>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> SMS is limited to 1 per user per 5 minutes platform-wide to
          prevent abuse.
        </p>
      </div>
    </div>
  );
}
