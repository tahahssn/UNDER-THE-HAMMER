'use client';

import React, { useEffect, useRef } from 'react';
import Badge from '@/components/Badge';
import {
  BidRecord,
  BidStatus,
  formatMoney,
  resolveCurrency,
} from '@/lib/auction-live';

export interface BidHistoryProps {
  bids: BidRecord[];
  /** Max height of the scroll area, e.g. "50vh" or "24rem". Default "50vh". */
  maxHeight?: string;
  /** Number of most-recent bids to show. Default 15. */
  limit?: number;
}

const statusVariant: Record<BidStatus, 'success' | 'warning' | 'danger'> = {
  accepted: 'success',
  pending: 'warning',
  rejected: 'danger',
};

const statusLabel: Record<BidStatus, string> = {
  accepted: 'Accepted',
  pending: 'Pending',
  rejected: 'Rejected',
};

function formatTime(timestamp: string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * BidHistory: scrollable feed of the most recent bids.
 *
 * Shows amount, bidding team, timestamp, and status (accepted/pending/rejected)
 * for the last `limit` bids. Auto-scrolls to the latest entry when a new bid
 * arrives (respecting reduced-motion via CSS). Renders an empty state when no
 * bids have been placed on the current player.
 */
export function BidHistory({ bids, maxHeight = '50vh', limit = 15 }: BidHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const recent = bids.slice(-limit);
  const latestKey = recent.length > 0 ? recent[recent.length - 1].id : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [latestKey]);

  return (
    <section aria-label="Bid history" className="flex flex-col">
      <h2 className="mb-2 text-sm font-semibold text-text-muted">Recent bids</h2>
      {recent.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
          No bids yet. Be the first to bid on this player.
        </p>
      ) : (
        <ul
          role="list"
          className="overflow-y-auto rounded-md border border-border bg-surface divide-y divide-border"
          style={{ maxHeight }}
        >
          {recent.map((bid) => {
            const currency = resolveCurrency(bid.currency);
            return (
              <li
                key={bid.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {bid.teamName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatTime(bid.timestamp)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="font-semibold tabular-nums text-text-primary">
                    {formatMoney(bid.amount, currency)}
                  </span>
                  <Badge variant={statusVariant[bid.status]} className="text-xs">
                    {statusLabel[bid.status]}
                  </Badge>
                </div>
              </li>
            );
          })}
          <div ref={bottomRef} aria-hidden="true" />
        </ul>
      )}
    </section>
  );
}

export default BidHistory;
