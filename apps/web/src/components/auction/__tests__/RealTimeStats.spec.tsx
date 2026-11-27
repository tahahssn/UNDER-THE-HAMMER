import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { RealTimeStats, formatMmSs } from '../RealTimeStats';

describe('formatMmSs', () => {
  it('formats seconds as MM:SS and clamps negatives to 00:00', () => {
    expect(formatMmSs(0)).toBe('00:00');
    expect(formatMmSs(65)).toBe('01:05');
    expect(formatMmSs(600)).toBe('10:00');
    expect(formatMmSs(-5)).toBe('00:00');
  });
});

describe('RealTimeStats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('displays bid count, time since last bid, and next break countdown', () => {
    const lastBid = Date.now() - 65_000; // 65s ago
    render(
      <RealTimeStats bidCount={4} lastBidTimestamp={lastBid} nextBreakIn={90} />
    );

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('01:05')).toBeTruthy(); // since last bid
    expect(screen.getByText('01:30')).toBeTruthy(); // next break
  });

  it('ticks the counters every second', () => {
    const lastBid = Date.now() - 65_000;
    render(
      <RealTimeStats bidCount={1} lastBidTimestamp={lastBid} nextBreakIn={90} />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('01:06')).toBeTruthy(); // since last bid +1s
    expect(screen.getByText('01:29')).toBeTruthy(); // break -1s
  });

  it('shows an em dash when there is no last bid or break scheduled', () => {
    render(
      <RealTimeStats bidCount={0} lastBidTimestamp={null} nextBreakIn={null} />
    );
    expect(screen.getAllByText('—').length).toBe(2);
  });
});
