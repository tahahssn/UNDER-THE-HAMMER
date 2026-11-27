/**
 * Live auction journey — integration ("E2E") test.
 *
 * The project has no browser E2E runner (Playwright/Cypress) wired up, so this
 * exercises the full user journey at the hook-integration level with a mocked
 * socket and fetch: place a valid bid → watch it accepted in real time →
 * leading team/purse update → break transition → reconnect and resume. This is
 * the closest faithful reproduction of the journey the task describes that the
 * current test harness supports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuctionRealTime } from '@/hooks/useAuctionRealTime';
import { useBidPlacement } from '@/hooks/useBidPlacement';

vi.mock('@/hooks/useSocket', () => ({ useSocket: vi.fn() }));
import { useSocket } from '@/hooks/useSocket';

function makeSocket() {
  const handlers: Record<string, Array<(p: unknown) => void>> = {};
  return {
    connected: true,
    emit: vi.fn(),
    on: (e: string, h: (p: unknown) => void) => {
      (handlers[e] ||= []).push(h);
    },
    off: (e: string, h: (p: unknown) => void) => {
      if (handlers[e]) handlers[e] = handlers[e].filter((x) => x !== h);
    },
    _emit: (e: string, d: unknown) => (handlers[e] || []).forEach((h) => h(d)),
  };
}

let socket: ReturnType<typeof makeSocket>;

beforeEach(() => {
  socket = makeSocket();
  (useSocket as any).mockReturnValue(socket);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ accepted: true }) })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('live auction journey', () => {
  it('places a bid, sees acceptance, a break, then reconnects and resumes', async () => {
    const realTime = renderHook(() =>
      useAuctionRealTime('a1', {
        initialPlayer: {
          id: 'p1',
          name: 'Star Player',
          role: 'Batter',
          category: 'Platinum',
          basePriceMinor: 10_000_000,
          currency: 'PKR',
          leadingTeam: null,
        },
        initialTeams: [
          { id: 't1', name: 'My Team', purse: 200_000_000, squadCount: 3, maxSquadSize: 15 },
        ],
      })
    );

    const bid = renderHook(() =>
      useBidPlacement({
        auctionId: 'a1',
        teamId: 't1',
        onOptimistic: (b) =>
          realTime.result.current.addOptimisticBid(b, 'My Team'),
      })
    );

    // 1. Place a valid bid — optimistic pending entry appears immediately.
    let key = '';
    await act(async () => {
      await bid.result.current.submitBid(15_000_000);
    });
    key = bid.result.current.lastIdempotencyKey ?? '';
    expect(key).not.toBe('');
    expect(realTime.result.current.bids).toHaveLength(1);
    expect(realTime.result.current.bids[0].status).toBe('pending');

    // 2. Server accepts the bid in real time, keyed by idempotency key.
    act(() => {
      socket._emit('bid:accepted', {
        bidId: 'b1',
        teamId: 't1',
        teamName: 'My Team',
        amountMinor: 15_000_000,
        idempotencyKey: key,
      });
    });
    expect(realTime.result.current.bids).toHaveLength(1);
    expect(realTime.result.current.bids[0].status).toBe('accepted');
    expect(realTime.result.current.currentPlayer?.leadingTeam?.amountMinor).toBe(15_000_000);

    // 3. Squad/purse update propagates to standings.
    act(() => {
      socket._emit('squad:updated', { auctionTeamId: 't1', totalAcquisitions: 4 });
    });
    expect(
      realTime.result.current.teams.find((t) => t.id === 't1')?.squadCount
    ).toBe(4);

    // 4. Break transition.
    act(() => socket._emit('break:started', {}));
    expect(realTime.result.current.breakState).toBe('active');
    act(() => socket._emit('break:ended', {}));
    expect(realTime.result.current.breakState).toBe('inactive');

    // 5. Reconnect: snapshot requested and state reconciled from the server.
    act(() => socket._emit('connect', undefined));
    expect(socket.emit).toHaveBeenCalledWith('auction:request-snapshot', {
      auctionId: 'a1',
    });
    act(() => {
      socket._emit('room:snapshot', {
        currentPlayer: {
          id: 'p2',
          name: 'Resumed Player',
          role: 'Bowler',
          category: 'Gold',
          basePriceMinor: 8_000_000,
          currency: 'PKR',
        },
        teams: [
          { id: 't1', name: 'My Team', purse: 185_000_000, squadCount: 4, maxSquadSize: 15 },
        ],
        breakActive: false,
      });
    });
    await waitFor(() =>
      expect(realTime.result.current.currentPlayer?.name).toBe('Resumed Player')
    );
    expect(
      realTime.result.current.teams.find((t) => t.id === 't1')?.purse
    ).toBe(185_000_000);
  });
});
