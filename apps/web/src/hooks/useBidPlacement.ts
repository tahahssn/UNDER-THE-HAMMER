'use client';

import { useCallback, useRef, useState } from 'react';
import { API_CONFIG } from '@/lib/constants';
import { getAuthToken } from '@/lib/api';
import {
  BidError,
  generateIdempotencyKey,
  normalizeBidError,
} from '@/lib/auction-live';

export interface OptimisticBid {
  amountMinor: number;
  idempotencyKey: string;
  teamId: string;
}

export interface UseBidPlacementOptions {
  auctionId: string;
  teamId: string;
  /**
   * Called synchronously when a bid is submitted, before the server responds,
   * so the UI can render an optimistic pending entry. Keyed by idempotency key
   * so the real-time layer can reconcile the accepted/rejected result.
   */
  onOptimistic?: (bid: OptimisticBid) => void;
  /** Max retry attempts on transient network failure (default 2). */
  maxRetries?: number;
  /** Base delay in ms between retries (default 300). */
  retryDelayMs?: number;
}

export interface UseBidPlacementResult {
  bidAmount: string;
  setBidAmount: (value: string) => void;
  error: BidError | null;
  lastError: BidError | null;
  isSubmitting: boolean;
  lastIdempotencyKey: string | null;
  submitBid: (amount?: number) => Promise<boolean>;
  clearError: () => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * useBidPlacement: owns bid form state and the submission lifecycle.
 *
 * - Generates a fresh idempotency key per submission (RFC4122 UUID).
 * - Emits an optimistic bid before awaiting the server so the feed updates
 *   immediately; the real-time layer reconciles acceptance/rejection by key.
 * - Posts to `POST /api/auctions/[id]/bids` with `{ amount, teamId, idempotencyKey }`.
 * - Maps server rejection codes onto user-facing {@link BidError} objects.
 * - Retries transient network failures with a short backoff; business
 *   rejections (HTTP 4xx) are never retried.
 *
 * The backend remains authoritative: optimistic UI is visual only and is
 * replaced by the server result.
 */
export function useBidPlacement(
  options: UseBidPlacementOptions
): UseBidPlacementResult {
  const {
    auctionId,
    teamId,
    onOptimistic,
    maxRetries = 2,
    retryDelayMs = 300,
  } = options;

  const [bidAmount, setBidAmount] = useState<string>('');
  const [error, setError] = useState<BidError | null>(null);
  const [lastError, setLastError] = useState<BidError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastIdempotencyKey, setLastIdempotencyKey] = useState<string | null>(
    null
  );

  // Guard against double submits racing within the same tick.
  const inFlightRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  const submitBid = useCallback(
    async (amount?: number): Promise<boolean> => {
      const parsed =
        typeof amount === 'number' ? amount : Number(bidAmount.trim());

      if (!Number.isFinite(parsed) || parsed <= 0) {
        const validationError: BidError = {
          code: 'INVALID_INCREMENT',
          message: 'Enter a valid bid amount.',
        };
        setError(validationError);
        setLastError(validationError);
        return false;
      }

      // Bids are integer minor units; reject fractional minor values.
      const amountMinor = Math.round(parsed);

      if (inFlightRef.current) return false;
      inFlightRef.current = true;

      const idempotencyKey = generateIdempotencyKey();
      setLastIdempotencyKey(idempotencyKey);
      setIsSubmitting(true);
      setError(null);

      // Optimistic update: show the bid as pending immediately.
      onOptimistic?.({ amountMinor, idempotencyKey, teamId });

      const token = getAuthToken();
      const url = `${API_CONFIG.baseUrl}/api/auctions/${encodeURIComponent(
        auctionId
      )}/bids`;
      const body = JSON.stringify({ amount: amountMinor, teamId, idempotencyKey });

      let attempt = 0;
      try {
        // Retry loop only covers transient transport failures.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body,
            });

            if (response.ok) {
              setError(null);
              return true;
            }

            // Business rejection: parse structured error, do not retry.
            let payload: unknown = null;
            try {
              payload = await response.json();
            } catch {
              payload = null;
            }
            const bidError = normalizeBidError(
              payload ?? { code: `HTTP_${response.status}` }
            );
            setError(bidError);
            setLastError(bidError);
            return false;
          } catch (networkErr) {
            // Transient network failure — retry with backoff.
            if (attempt >= maxRetries) {
              const netError: BidError = {
                code: 'NETWORK_ERROR',
                message:
                  networkErr instanceof Error
                    ? networkErr.message
                    : 'Network error while placing bid.',
              };
              setError(netError);
              setLastError(netError);
              return false;
            }
            attempt += 1;
            await sleep(retryDelayMs * attempt);
          }
        }
      } finally {
        setIsSubmitting(false);
        inFlightRef.current = false;
      }
    },
    [auctionId, teamId, bidAmount, onOptimistic, maxRetries, retryDelayMs]
  );

  return {
    bidAmount,
    setBidAmount,
    error,
    lastError,
    isSubmitting,
    lastIdempotencyKey,
    submitBid,
    clearError,
  };
}

export default useBidPlacement;
