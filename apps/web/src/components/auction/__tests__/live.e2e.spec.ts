/**
 * Live auction journey — integration ("E2E") test.
 *
 * The project has no browser E2E runner (Playwright/Cypress) wired up, so this
 * exercises the full user journey at the hook-integration level against the
 * REAL transport contract: a bid is placed by emitting the gateway message
 * `bid:submit`, and the server answers with `bid:accepted` carrying the echoed
 * idempotency key. Player advancement and squad/purse updates arrive via
 * `room:snapshot` (requested after `player:sold`), exactly as the Phase I
 * backend broadcasts them — so this test fails if the frontend drifts back to
 * an HTTP `/bids` call or to events the backend never emits.
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
  (useSocket as unknown as ReturnType<typeof vi.fn>).mockReturnValue(socket);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('live auction journey', () => {
  it('places a bid over the socket, sees acceptance, a break, then reconnects', async () => {
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
        auctionPlayerId: 'p1',
        stateVersion: 1,
        onOptimistic: (b) =>
          realTime.result.current.addOptimisticBid(b, 'My Team'),
      })
    );

    // 1. Place a valid bid — emitted as bid:submit, optimistic pending appears.
    await act(async () => {
      await bid.result.current.submitBid(15_000_000);
    });
    const [event, payload] = socket.emit.mock.calls[0];
    expect(event).toBe('bid:submit');
    const key = (payload as { idempotencyKey: string }).idempotencyKey;
    expect(key).toBeTruthy();
    expect(realTime.result.current.bids).toHaveLength(1);
    expect(realTime.result.current.bids[0].status).toBe('pending');

    // 2. Server accepts the bid in real time, keyed by idempotency key.
    act(() => {
      socket._emit('bid:accepted', {
        bidId: 'b1',
        teamId: 't1',
        teamName: 'My Team',
        amountMinor: '15000000',
        idempotencyKey: key,
      });
    });
    expect(realTime.result.current.bids).toHaveLength(1);
    expect(realTime.result.current.bids[0].status).toBe('accepted');
    expect(realTime.result.current.currentPlayer?.leadingTeam?.amountMinor).toBe(15_000_000);

    // 3. Player sold → a fresh snapshot is requested, advancing player + purse.
    act(() => socket._emit('player:sold', { auctionPlayerId: 'p1', teamId: 't1' }));
    expect(socket.emit).toHaveBeenCalledWith('auction:request-snapshot', {
      auctionId: 'a1',
    });
    act(() => {
      socket._emit('room:snapshot', {
        currentPlayerId: 'p2',
        currentPlayer: { id: 'p2', name: 'Next Player', category: 'Gold' },
        teams: [
          {
            id: 't1',
            name: 'My Team',
            purseBalanceMinor: '185000000',
            acquisitions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
          },
        ],
        breakActive: false,
      });
    });
    expect(realTime.result.current.currentPlayer?.name).toBe('Next Player');
    expect(realTime.result.current.teams.find((t) => t.id === 't1')?.purse).toBe(185_000_000);
    expect(realTime.result.current.teams.find((t) => t.id === 't1')?.squadCount).toBe(4);

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
        currentPlayerId: 'p3',
        currentPlayer: { id: 'p3', name: 'Resumed Player', category: 'Gold' },
        teams: [
          {
            id: 't1',
            name: 'My Team',
            purseBalanceMinor: '185000000',
            acquisitions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
          },
        ],
        breakActive: false,
      });
    });
    await waitFor(() =>
      expect(realTime.result.current.currentPlayer?.name).toBe('Resumed Player')
    );
  });
});
