'use client';

import React, { useCallback, useMemo } from 'react';
import Button from '@/components/Button';
import { useBidPlacement } from '@/hooks/useBidPlacement';
import {
  BidIncrementBracket,
  computeMinimumBid,
  DEFAULT_INCREMENT_BRACKETS,
  formatMoney,
  resolveCurrency,
} from '@/lib/auction-live';
import { BidPlacementError } from './BidPlacementError';

export interface BidPlacementFormProps {
  auctionId: string;
  roomId: string;
  teamId: string;
  /** The player currently on the block; required for the bid payload. */
  auctionPlayerId: string;
  /** Latest optimistic-concurrency version for the auction. */
  stateVersion?: number;
  /** Remaining team purse in integer minor units. */
  currentTeamPurse: number;
  /** Player base price in integer minor units. */
  basePrice: number;
  /** Current leading accepted bid in integer minor units, or null if none yet. */
  currentLeadingBid?: number | null;
  /** Maximum allowed bid in integer minor units (usually the team purse). */
  maxBid: number;
  /** Phase G increment brackets used to compute the next valid bid preview. */
  incrementBrackets?: readonly BidIncrementBracket[];
  /** ISO currency code for display (default PKR). */
  currency?: string;
  /**
   * Called when a bid is submitted (optimistic), before the server confirms.
   * The parent uses this to render a pending entry keyed by idempotency key.
   */
  onSubmit: (bidAmount: number, idempotencyKey: string) => void;
  disabled?: boolean;
}

/**
 * BidPlacementForm: validated bid entry with keyboard support.
 *
 * - The next valid bid is computed from the Phase G increment brackets
 *   ({@link computeMinimumBid}) so the client preview matches server validation
 *   and can suggest the next valid amount. The backend remains authoritative.
 * - Enter submits, Escape clears the input and any error, Tab follows DOM
 *   order. The submit button is disabled while a bid is in flight.
 * - Submission flows through {@link useBidPlacement}, which generates the
 *   idempotency key and emits `bid:submit`; `onSubmit` is invoked optimistically.
 */
export function BidPlacementForm({
  auctionId,
  teamId,
  auctionPlayerId,
  stateVersion,
  currentTeamPurse,
  basePrice,
  currentLeadingBid = null,
  maxBid,
  incrementBrackets = DEFAULT_INCREMENT_BRACKETS,
  currency,
  onSubmit,
  disabled = false,
}: BidPlacementFormProps) {
  const resolvedCurrency = resolveCurrency(currency);

  // Next valid bid from the increment brackets (one step above the leader, or
  // the base price when no bid has been placed yet).
  const minimumBid = useMemo(
    () => computeMinimumBid(currentLeadingBid, basePrice, incrementBrackets),
    [currentLeadingBid, basePrice, incrementBrackets]
  );

  const handleOptimistic = useCallback(
    (bid: { amountMinor: number; idempotencyKey: string }) => {
      onSubmit(bid.amountMinor, bid.idempotencyKey);
    },
    [onSubmit]
  );

  const {
    bidAmount,
    setBidAmount,
    error,
    isSubmitting,
    submitBid,
    clearError,
  } = useBidPlacement({
    auctionId,
    teamId,
    auctionPlayerId,
    stateVersion,
    onOptimistic: handleOptimistic,
  });

  const parsedAmount = Number(bidAmount.trim());
  const hasAmount = bidAmount.trim().length > 0;

  // Client-side preview validation (not authoritative).
  const validationMessage = useMemo<string | null>(() => {
    if (!hasAmount) return null;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return 'Enter a valid amount.';
    }
    if (parsedAmount < minimumBid) {
      return `Minimum bid is ${formatMoney(minimumBid, resolvedCurrency)}.`;
    }
    if (parsedAmount > currentTeamPurse) {
      return `Exceeds your purse (${formatMoney(
        currentTeamPurse,
        resolvedCurrency
      )}).`;
    }
    if (parsedAmount > maxBid) {
      return `Maximum bid is ${formatMoney(maxBid, resolvedCurrency)}.`;
    }
    return null;
  }, [
    hasAmount,
    parsedAmount,
    minimumBid,
    maxBid,
    currentTeamPurse,
    resolvedCurrency,
  ]);

  const canSubmit =
    !disabled &&
    !isSubmitting &&
    hasAmount &&
    validationMessage === null &&
    Number.isFinite(parsedAmount);

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSubmit) return;
      const accepted = await submitBid(parsedAmount);
      if (accepted) {
        setBidAmount('');
      }
    },
    [canSubmit, parsedAmount, submitBid, setBidAmount]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void handleSubmit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setBidAmount('');
        clearError();
      }
    },
    [handleSubmit, setBidAmount, clearError]
  );

  const setToMinimum = useCallback(() => {
    setBidAmount(String(minimumBid));
    clearError();
  }, [minimumBid, setBidAmount, clearError]);

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Place a bid"
      className="space-y-4"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">Next valid bid</span>
        <button
          type="button"
          onClick={setToMinimum}
          disabled={disabled}
          className="font-semibold text-accent transition-colors duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {formatMoney(minimumBid, resolvedCurrency)}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor="bid-amount" className="sr-only">
            Bid amount in {resolvedCurrency} minor units
          </label>
          <input
            id="bid-amount"
            name="bid-amount"
            type="number"
            inputMode="numeric"
            min={minimumBid}
            max={maxBid}
            step={1}
            value={bidAmount}
            disabled={disabled}
            aria-invalid={validationMessage !== null}
            aria-describedby={
              validationMessage ? 'bid-amount-error' : undefined
            }
            onChange={(e) => {
              setBidAmount(e.target.value);
              if (error) clearError();
            }}
            onKeyDown={handleKeyDown}
            placeholder={`e.g. ${minimumBid}`}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary transition-colors duration-200 placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={isSubmitting}
          disabled={!canSubmit}
          className="sm:w-auto"
        >
          Place bid
        </Button>
      </div>

      {validationMessage && (
        <p id="bid-amount-error" className="text-sm text-warning">
          {validationMessage}
        </p>
      )}

      <BidPlacementError error={error} onDismiss={clearError} />

      <p className="text-xs text-text-muted">
        Purse remaining: {formatMoney(currentTeamPurse, resolvedCurrency)}
      </p>
    </form>
  );
}

export default BidPlacementForm;
