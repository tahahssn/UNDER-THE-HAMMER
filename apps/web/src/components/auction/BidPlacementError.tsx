'use client';

import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { BidError, formatMoney, resolveCurrency } from '@/lib/auction-live';

export interface BidPlacementErrorProps {
  error: BidError | null;
  onDismiss: () => void;
}

interface ErrorContent {
  title: string;
  suggestion: string;
}

/**
 * Map a structured {@link BidError} onto a user-facing title and suggestion.
 * Pure function so the mapping is easy to test in isolation.
 */
function describeError(error: BidError): ErrorContent {
  const currency = resolveCurrency(error.currency);

  switch (error.code) {
    case 'INSUFFICIENT_PURSE':
      return {
        title: 'Not enough purse for this bid.',
        suggestion:
          typeof error.availableMinor === 'number'
            ? `Bid exceeds your team purse. Available: ${formatMoney(
                error.availableMinor,
                currency
              )}.`
            : 'Bid exceeds your remaining team purse.',
      };
    case 'INVALID_INCREMENT':
      return {
        title: 'Bid does not match the required increment.',
        suggestion:
          typeof error.minimumBidMinor === 'number'
            ? `Next valid bid is at least ${formatMoney(
                error.minimumBidMinor,
                currency
              )}.`
            : 'Raise your bid to the next valid increment.',
      };
    case 'UNAUTHORIZED_TEAM':
      return {
        title: 'You are not allowed to bid for this team.',
        suggestion:
          'Only an owner of a participating team can place bids. Spectators are read-only.',
      };
    case 'PLAYER_SOLD':
      return {
        title: 'This player has already been sold.',
        suggestion: 'Wait for the next player to be introduced.',
      };
    case 'AUCTION_NOT_ACTIVE':
      return {
        title: 'The auction is not currently accepting bids.',
        suggestion:
          'Bidding is paused or the auction is not live. Wait for the host to resume.',
      };
    case 'BID_AFTER_DEADLINE':
      return {
        title: 'The bidding window has closed.',
        suggestion:
          'The countdown ended before your bid was received. Watch for the next player.',
      };
    case 'DUPLICATE_IDEMPOTENCY_KEY':
      return {
        title: 'This bid was already submitted.',
        suggestion:
          'Your previous bid is being processed. No duplicate bid was placed.',
      };
    default:
      return {
        title: 'Your bid could not be placed.',
        suggestion:
          error.message ?? 'Please try again. If this persists, reconnect.',
      };
  }
}

/**
 * BidPlacementError: accessible, user-friendly bid rejection display.
 *
 * Renders a dismissible alert mapping Phase G rejection codes onto a clear
 * message and recovery suggestion. Rendered as an assertive live region so
 * screen readers announce rejections immediately.
 */
export function BidPlacementError({ error, onDismiss }: BidPlacementErrorProps) {
  if (!error) return null;

  const { title, suggestion } = describeError(error);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm"
    >
      <AlertCircle
        className="mt-0.5 flex-shrink-0 text-danger"
        size={18}
        aria-hidden="true"
      />
      <div className="flex-1">
        <p className="font-semibold text-danger">{title}</p>
        <p className="mt-1 text-text-muted">{suggestion}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="flex-shrink-0 rounded p-1 text-text-muted transition-colors duration-200 hover:bg-surface-raised hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent cursor-pointer"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default BidPlacementError;
