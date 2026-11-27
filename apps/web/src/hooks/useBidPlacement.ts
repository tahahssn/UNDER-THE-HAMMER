'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
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
  /** The player currently on the block; required for the bid payload. */
  auctionPlayerId: string;
  /** Latest known optimistic-concurrency version for the auction. */
  stateVersion?: number;
  /**
   * Called synchronously when a bid is submitted, before the server responds,
   * so the UI can render an optimistic pending entry. Keyed by idempotency key
   * so the real-time layer can reconcile the accepted/rejected result.
   */
  onOptimistic?: (bid: OptimisticBid) => void;
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

/**
 * useBidPlacement: owns bid form state and the submission lifecycle.
 *
 * Bids are placed over the authoritative Socket.IO transport, not HTTP: the
 * backend accepts them only via the `bid:submit` gateway message and answers
 * with `bid:accepted` / `bid:rejected` / `bid:error` events that echo the
 * submitter's idempotency key.
 *
 * - Generates a fresh idempotency key per submission (RFC4122 UUID).
 * - Emits an optimistic bid before the server responds so the feed updates
 *   immediately; the real-time layer reconciles acceptance/rejection by key.
 * - Resolves `submitBid` as soon as the bid is handed to the transport
 *   (optimistic). A later `bid:rejected` / `bid:error` carrying this key sets a
 *   user-facing {@link BidError}; the backend remains authoritative.
 * - When the socket is not connected the submission fails fast with a network
 *   error (Socket.IO transparently reconnects and the user can retry).
 */
export function useBidPlacement(
  options: UseBidPlacementOptions
): UseBidPlacementResult {
  const { auctionId, teamId, auctionPlayerId, stateVersion = 0, onOptimistic } =
    options;

  const socket = useSocket();

  const [bidAmount, setBidAmount] = useState<string>('');
  const [error, setError] = useState<BidError | null>(null);
  const [lastError, setLastError] = useState<BidError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastIdempotencyKey, setLastIdempotencyKey] = useState<string | null>(
    null
  );

  // Guard against double submits racing within the same tick.
  const inFlightRef = useRef(false);
  // The key we are currently awaiting a server verdict for.
  const pendingKeyRef = useRef<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Surface server rejections/errors that match our pending submission. The
  // accepted path is reconciled by useAuctionRealTime; here we only need to
  // turn a rejection into a visible error on the form.
  useEffect(() => {
    if (!socket) return;

    const matchesPending = (payload: unknown): boolean => {
      if (!payload || typeof payload !== 'object') return false;
      const key = (payload as { idempotencyKey?: unknown }).idempotencyKey;
      return (
        typeof key === 'string' &&
        pendingKeyRef.current !== null &&
        key === pendingKeyRef.current
      );
    };

    const handleRejected = (payload: unknown) => {
      if (!matchesPending(payload)) return;
      const bidError = normalizeBidError(payload);
      setError(bidError);
      setLastError(bidError);
      pendingKeyRef.current = null;
    };

    const handleAccepted = (payload: unknown) => {
      if (!matchesPending(payload)) return;
      setError(null);
      pendingKeyRef.current = null;
    };

    socket.on('bid:rejected', handleRejected);
    socket.on('bid:error', handleRejected);
    socket.on('bid:accepted', handleAccepted);

    return () => {
      socket.off('bid:rejected', handleRejected);
      socket.off('bid:error', handleRejected);
      socket.off('bid:accepted', handleAccepted);
    };
  }, [socket]);

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

      if (!socket || !socket.connected) {
        const netError: BidError = {
          code: 'NETWORK_ERROR',
          message: 'Not connected. Reconnecting — please try again.',
        };
        setError(netError);
        setLastError(netError);
        return false;
      }

      inFlightRef.current = true;
      const idempotencyKey = generateIdempotencyKey();
      pendingKeyRef.current = idempotencyKey;
      setLastIdempotencyKey(idempotencyKey);
      setIsSubmitting(true);
      setError(null);

      try {
        // Optimistic update: show the bid as pending immediately.
        onOptimistic?.({ amountMinor, idempotencyKey, teamId });

        // Authoritative transport: the gateway validates and answers with
        // bid:accepted / bid:rejected / bid:error carrying this key.
        socket.emit('bid:submit', {
          auctionId,
          auctionPlayerId,
          auctionTeamId: teamId,
          amountMinor: String(amountMinor),
          idempotencyKey,
          stateVersion,
        });

        return true;
      } finally {
        setIsSubmitting(false);
        inFlightRef.current = false;
      }
    },
    [
      socket,
      auctionId,
      auctionPlayerId,
      stateVersion,
      teamId,
      bidAmount,
      onOptimistic,
    ]
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
