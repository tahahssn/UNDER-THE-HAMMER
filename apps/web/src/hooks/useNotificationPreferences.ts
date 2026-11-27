import { useState, useCallback, useEffect } from 'react';

export interface UserPreference {
  userId: string;
  category: string;
  channels: {
    inApp: { enabled: boolean; consentedAt?: string };
    email: { enabled: boolean; consentedAt?: string };
    sms: { enabled: boolean; consentedAt?: string };
  };
}

export interface PreferencesResponse {
  data: UserPreference[];
}

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/notifications/preferences', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch preferences: ${response.statusText}`);
      }

      const data: PreferencesResponse = await response.json();
      setPreferences(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = useCallback(
    async (
      category: string,
      channels: { inApp?: boolean; email?: boolean; sms?: boolean },
    ) => {
      setUpdating(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/v1/notifications/preferences/${category}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ channels }),
          },
        );

        if (!response.ok) {
          throw new Error('Failed to update preferences');
        }

        const data: PreferencesResponse = await response.json();
        setPreferences(data.data);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [],
  );

  return {
    preferences,
    loading,
    updating,
    error,
    updatePreference,
    refetch: fetchPreferences,
  };
}
