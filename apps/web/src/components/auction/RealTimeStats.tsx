'use client';

import React, { useEffect, useState } from 'react';

export interface RealTimeStatsProps {
  /** Number of bids placed on the current player. */
  bidCount: number;
  /** Timestamp of the most recent bid (ms epoch, ISO string, or Date). */
  lastBidTimestamp: number | string | Date | null;
  /**
   * Accepted bids remaining before the next scheduled break, or null when no
   * break cadence is configured. Breaks are proposed after every N accepted
   * bids (Phase H), so the countdown is in bids, not seconds.
   */
  bidsUntilBreak: number | null;
}

/** Format a non-negative number of seconds as MM:SS. */
export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toMs(value: number | string | Date | null): number | null {
  if (value === null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

// Approaching-break thresholds (bids remaining).
const BREAK_WARN_AT = 5;
const BREAK_DANGER_AT = 2;

/**
 * RealTimeStats: live counters for the active player.
 *
 * Displays the bid count, time elapsed since the last bid (MM:SS, ticking once
 * per second), and the number of accepted bids remaining before the next
 * break. The break counter changes colour as it approaches (warn / danger) so
 * owners can anticipate the pause.
 */
export function RealTimeStats({
  bidCount,
  lastBidTimestamp,
  bidsUntilBreak,
}: RealTimeStatsProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const lastBidMs = toMs(lastBidTimestamp);
  const secondsSinceBid =
    lastBidMs !== null ? Math.max(0, Math.floor((now - lastBidMs) / 1000)) : null;

  const breakRemaining =
    bidsUntilBreak !== null ? Math.max(0, Math.floor(bidsUntilBreak)) : null;

  const breakColorClass =
    breakRemaining === null
      ? 'text-text-primary'
      : breakRemaining <= BREAK_DANGER_AT
        ? 'text-danger'
        : breakRemaining <= BREAK_WARN_AT
          ? 'text-warning'
          : 'text-text-primary';

  return (
    <dl
      aria-label="Live auction stats"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <div className="rounded-lg border border-border bg-surface p-3 text-center">
        <dt className="text-xs uppercase tracking-wide text-text-muted">
          Bids this player
        </dt>
        <dd
          aria-live="polite"
          className="mt-1 text-2xl font-bold tabular-nums text-text-primary"
        >
          {Math.max(0, bidCount)}
        </dd>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3 text-center">
        <dt className="text-xs uppercase tracking-wide text-text-muted">
          Since last bid
        </dt>
        <dd
          aria-live="polite"
          className="mt-1 text-2xl font-bold tabular-nums text-text-primary"
        >
          {secondsSinceBid !== null ? formatMmSs(secondsSinceBid) : '—'}
        </dd>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3 text-center">
        <dt className="text-xs uppercase tracking-wide text-text-muted">
          Next break in
        </dt>
        <dd
          aria-live="polite"
          className={`mt-1 text-2xl font-bold tabular-nums ${breakColorClass}`}
        >
          {breakRemaining !== null
            ? `${breakRemaining} ${breakRemaining === 1 ? 'bid' : 'bids'}`
            : '—'}
        </dd>
      </div>
    </dl>
  );
}

export default RealTimeStats;
