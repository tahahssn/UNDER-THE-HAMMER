'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { SubscriptionDetailDto } from '@uth/contracts';
import { getSubscription } from '@/lib/api';

interface UseSubscriptionReturn {
  subscription: SubscriptionDetailDto | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Cache for subscription data with 5 minute stale time
let subscriptionCache: {
  data: SubscriptionDetailDto | null;
  timestamp: number;
} | null = null;

const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Custom hook to fetch and cache current user subscription.
 * Uses 5 minute stale time for caching.
 * Returns null subscription gracefully on 401 or other errors.
 */
export const useSubscription = (): UseSubscriptionReturn => {
  const [subscription, setSubscription] = useState<SubscriptionDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check cache validity
      const now = Date.now();
      if (subscriptionCache && now - subscriptionCache.timestamp < STALE_TIME_MS) {
        setSubscription(subscriptionCache.data);
        setIsLoading(false);
        return;
      }

      const response = await getSubscription();

      if (response.success && response.data?.subscription) {
        const sub = response.data.subscription;
        subscriptionCache = { data: sub, timestamp: now };
        setSubscription(sub);
      } else if (response.error?.includes('401') || response.error?.includes('Unauthorized')) {
        // Gracefully handle 401
        setSubscription(null);
        subscriptionCache = { data: null, timestamp: now };
      } else {
        // Handle other errors gracefully
        console.warn('Failed to fetch subscription:', response.error);
        setSubscription(null);
        setError(response.error || 'Failed to load subscription');
      }
    } catch (err) {
      console.error('Subscription fetch error:', err);
      setSubscription(null);
      setError('Failed to load subscription');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      subscription,
      isLoading,
      error,
      refetch: fetchSubscription,
    }),
    [subscription, isLoading, error, fetchSubscription]
  );
};

export default useSubscription;
