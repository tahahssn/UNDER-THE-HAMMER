import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuctionRealTime } from './useAuctionRealTime';

vi.mock('./useSocket', () => ({
  useSocket: vi.fn(),
}));

import { useSocket } from './useSocket';

function makeSocket() {
  const handlers: Record<string, Array<(p: unknown) => void>> = {};
  return {
    connected: true,
    emit: vi.fn(),
    on: (event: string, handler: (p: unknown) => void) => {
      (handlers[event] ||= []).push(handler);
    },
    off: (event: string, handler: (p: unknown) => void) => {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
      }
    },
    _emit: (event: string, data: unknown) => {
      (handlers[event] || []).forEach((h) => h(data));
    },
    _handlers: handlers,
  };
}

let socket: ReturnType<typeof makeSocket>;

beforeEach(() => {
  socket = makeSocket();
  (useSocket as unknown as ReturnType<typeof vi.fn>).mockReturnValue(socket);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAuctionRealTime', () => {
  it('subscribes to the events the backend actually emits', () => {
    renderHook(() => useAuctionRealTime('a1'));
    expect(socket._handlers['bid:accepted']).toBeDefined();
    expect(socket._handlers['bid:rejected']).toBeDefined();
    expect(socket._handlers['player:sold']).toBeDefined();
    expect(socket._handlers['break:started']).toBeDefined();
    expect(socket._handlers['room:snapshot']).toBeDefined();
    // Events that Phase I never broadcasts are not relied upon for advancement.
    expect(socket._handlers['player:introduced']).toBeUndefined();
    expect(socket._handlers['squad:updated']).toBeUndefined();
  });

  it('records an accepted bid and updates the leading team', () => {
    const { result } = renderHook(() =>
      useAuctionRealTime('a1', {
        initialPlayer: {
          id: 'p1',
          name: 'P',
          role: 'Batter',
          category: 'Gold',
          basePriceMinor: 1000,
          currency: 'PKR',
          leadingTeam: null,
        },
        initialTeams: [
          { id: 't1', name: 'Lahore', purse: 1, squadCount: 0, maxSquadSize: 10 },
        ],
      })
    );

    act(() => {
      socket._emit('bid:accepted', {
        bidId: 'b1',
        teamId: 't1',
        amountMinor: '12000000',
        timestamp: '2026-01-01T00:00:00Z',
      });
    });

    expect(result.current.bids.length).toBe(1);
    expect(result.current.bids[0].status).toBe('accepted');
    // Team name resolved from the standings list.
    expect(result.current.bids[0].teamName).toBe('Lahore');
    expect(result.current.currentPlayer?.leadingTeam?.id).toBe('t1');
    expect(result.current.currentPlayer?.leadingTeam?.amountMinor).toBe(12_000_000);
  });

  it('deduplicates an optimistic bid against its accepted event by idempotency key', () => {
    const { result } = renderHook(() => useAuctionRealTime('a1'));

    act(() => {
      result.current.addOptimisticBid(
        { amountMinor: 10_000_000, idempotencyKey: 'key-1', teamId: 't1' },
        'Karachi'
      );
    });
    expect(result.current.bids.length).toBe(1);
    expect(result.current.bids[0].status).toBe('pending');

    act(() => {
      socket._emit('bid:accepted', {
        bidId: 'b1',
        teamId: 't1',
        amountMinor: 10_000_000,
        idempotencyKey: 'key-1',
      });
    });

    // Reconciled in place — no duplicate entry.
    expect(result.current.bids.length).toBe(1);
    expect(result.current.bids[0].status).toBe('accepted');
  });

  it('ignores duplicate accepted events with the same bid id', () => {
    const { result } = renderHook(() => useAuctionRealTime('a1'));
    const payload = { bidId: 'b1', teamId: 't1', amountMinor: 5_000_000 };
    act(() => {
      socket._emit('bid:accepted', payload);
      socket._emit('bid:accepted', payload);
    });
    expect(result.current.bids.length).toBe(1);
  });

  it('marks a pending bid rejected on bid:rejected', () => {
    const { result } = renderHook(() => useAuctionRealTime('a1'));
    act(() => {
      result.current.addOptimisticBid(
        { amountMinor: 10_000_000, idempotencyKey: 'key-2', teamId: 't1' },
        'Multan'
      );
    });
    act(() => {
      socket._emit('bid:rejected', {
        bidId: 'b2',
        idempotencyKey: 'key-2',
        reason: 'BELOW_MINIMUM',
      });
    });
    expect(result.current.bids[0].status).toBe('rejected');
  });

  it('requests a fresh snapshot on player:sold to advance the player', () => {
    const { result } = renderHook(() => useAuctionRealTime('a1'));
    act(() => {
      socket._emit('bid:accepted', { bidId: 'b1', teamId: 't1', amountMinor: 1000 });
    });
    expect(result.current.bids.length).toBe(1);

    act(() => socket._emit('player:sold', { auctionPlayerId: 'p1' }));
    expect(socket.emit).toHaveBeenCalledWith('auction:request-snapshot', {
      auctionId: 'a1',
    });

    act(() => {
      socket._emit('room:snapshot', {
        currentPlayerId: 'p2',
        currentPlayer: { id: 'p2', name: 'New Player', category: 'Silver' },
        teams: [
          {
            id: 't1',
            name: 'Lahore',
            purseBalanceMinor: '9000000',
            acquisitions: [{ id: 'a' }],
          },
        ],
        breakActive: false,
      });
    });
    expect(result.current.currentPlayer?.name).toBe('New Player');
    expect(result.current.bids.length).toBe(0);
    expect(result.current.teams[0].purse).toBe(9_000_000);
    expect(result.current.teams[0].squadCount).toBe(1);
  });

  it('toggles break state on break events', () => {
    const { result } = renderHook(() => useAuctionRealTime('a1'));
    act(() => socket._emit('break:started', {}));
    expect(result.current.breakState).toBe('active');
    act(() => socket._emit('break:ended', {}));
    expect(result.current.breakState).toBe('inactive');
  });

  it('requests a fresh snapshot on reconnect and reconciles state', () => {
    const onReconcile = vi.fn();
    const { result } = renderHook(() =>
      useAuctionRealTime('a1', { onReconcile })
    );

    act(() => socket._emit('connect', undefined));
    expect(socket.emit).toHaveBeenCalledWith('auction:request-snapshot', {
      auctionId: 'a1',
    });

    act(() => {
      socket._emit('room:snapshot', {
        currentPlayerId: 'p9',
        currentPlayer: { id: 'p9', name: 'Snapshot Player', category: 'Gold' },
        teams: [
          {
            id: 't1',
            name: 'A',
            purseBalanceMinor: '1',
            acquisitions: [],
          },
        ],
        breakActive: false,
      });
    });

    expect(result.current.currentPlayer?.name).toBe('Snapshot Player');
    expect(result.current.teams.length).toBe(1);
    expect(onReconcile).toHaveBeenCalled();
  });

  it('records a normalized event stream', () => {
    const { result } = renderHook(() => useAuctionRealTime('a1'));
    act(() => socket._emit('player:sold', { auctionPlayerId: 'p1' }));
    expect(result.current.events.some((e) => e.type === 'PLAYER_SOLD')).toBe(true);
  });
});
