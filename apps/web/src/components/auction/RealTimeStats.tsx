'use client';

import React, { useEffect, useState } from 'react';

export interface RealTimeStatsProps {
  /** Number of bids placed on the current player. */
  bidCount: number;
  /** Timestamp of the most recent bid (ms epoch, ISO string, or Date). */
  lastBidTimestamp: number | string | Date | null;
  /** Seconds until the next scheduled break, or null when none is scheduled. */
  nextBreakIn: number | null;
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

/**
 * RealTimeStats: live counters for the active player.
 *
 * Displays the bid count, time elapsed since the last bid, and a countdown to
 * the next scheduled break. The elapsed/countdown values tick once per second
 * using a single interval; the remaining break time renders in MM:SS.
 */
export function RealTimeStats({
  bidCount,
  lastBidTimestamp,
  nextBreakIn,
}: RealTimeStatsProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  // Anchor the break countdown as state when the input changes so a change
  // reliably triggers a re-render (a ref + same-value setNow would bail out).
  const [breakTarget, setBreakTarget] = useState<number | null>(() =>
    typeof nextBreakIn === 'number' ? Date.now() + nextBreakIn * 1000 : null
  );
  useEffect(() => {
    setBreakTarget(
      typeof nextBreakIn === 'number' ? Date.now() + nextBreakIn * 1000 : null
    );
  }, [nextBreakIn]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const lastBidMs = toMs(lastBidTimestamp);
  const secondsSinceBid =
    lastBidMs !== null ? Math.max(0, Math.floor((now - lastBidMs) / 1000)) : null;

  const breakRemaining =
    breakTarget !== null
      ? Math.max(0, Math.floor((breakTarget - now) / 1000))
      : null;

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
          className="mt-1 text-2xl font-bold tabular-nums text-text-primary"
        >
          {breakRemaining !== null ? formatMmSs(breakRemaining) : '—'}
        </dd>
      </div>
    </dl>
  );
}

export default RealTimeStats;
