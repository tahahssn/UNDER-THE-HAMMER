'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckoutResponse, SubscriptionPlan } from '@uth/contracts';
import { api } from '@/lib/api';

interface UseCheckoutReturn {
  initiateCheckout: () => Promise<void>;
  isLoading: boolean;
  checkoutUrl: string | null;
  sessionId: string | null;
  error: string | null;
}

/**
 * Custom hook to handle checkout initiation.
 * Accepts planId and optional idempotencyKey.
 * Returns checkout URL for SafePay redirect.
 * Caches response so duplicate calls return same URL without new API requests.
 * 
 * Cache is invalidated when planId prop changes to prevent checkout for wrong plan.
 */
export const useCheckout = (planId: string, idempotencyKey?: string): UseCheckoutReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const generatedIdempotencyKey = useMemo(() => idempotencyKey || crypto.randomUUID(), [idempotencyKey]);

  // Invalidate cache when planId changes (critical: prevents checkout for wrong plan)
  useEffect(() => {
    setCheckoutUrl(null);
    setSessionId(null);
    setError(null);
    setRetryCount(0);
  }, [planId]);

  const initiateCheckout = useCallback(async () => {
    // If we already have a checkout URL, don't make a new request
    if (checkoutUrl) {
      return;
    }

    if (retryCount >= MAX_RETRIES) {
      setError('Max retry attempts reached. Please try again later.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.post<CheckoutResponse>(
        `/v1/subscriptions/checkout/${planId}`,
        {
          idempotencyKey: generatedIdempotencyKey,
        }
      );

      if (response.data) {
        setCheckoutUrl(response.data.checkoutUrl);
        setSessionId(response.data.sessionId);
      } else {
        setError('Failed to generate checkout URL');
      }
    } catch (err: any) {
      console.error('Checkout initiation error:', err);
      
      // Network error - attempt retry with exponential backoff
      if (err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND' || !err.response) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, delay);
        
        if (retryCount === 0) {
          setError('Network error. Retrying...');
        }
      } else {
        const errorMessage = err.response?.data?.error || 'Failed to initiate checkout';
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [planId, generatedIdempotencyKey, checkoutUrl, retryCount]);

  return useMemo(
    () => ({
      initiateCheckout,
      isLoading,
      checkoutUrl,
      sessionId,
      error,
    }),
    [initiateCheckout, isLoading, checkoutUrl, sessionId, error]
  );
};

export default useCheckout;
