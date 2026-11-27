import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useAuctionState,
  __clearAuctionStateCache,
  AuctionStateResponse,
} from './useAuctionState';

const sample: AuctionStateResponse = {
  auction: {
    id: 'a1',
    roomId: 'r1',
    phase: 'LIVE',
    status: 'LIVE',
    stateVersion: 3,
  },
  room: { id: 'r1', name: 'Mega Auction', isMember: true, role: 'TEAM_OWNER', teamId: 't1' },
  teams: [
    { id: 't1', name: 'A', logo: null, purse: 100, squadCount: 1, maxSquadSize: 15 },
  ],
  currentPlayer: {
    id: 'p1',
    name: 'Player One',
    role: 'Batter',
    category: 'Gold',
    basePriceMinor: 1000,
    currency: 'PKR',
    leadingTeam: null,
  },
};

function okFetch(data: AuctionStateResponse = sample) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

beforeEach(() => {
  __clearAuctionStateCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useAuctionState', () => {
  it('fetches state on mount and exposes the parsed result', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuctionState('a1', 'r1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/auctions/a1/state');
    expect(url).toContain('roomId=r1');

    expect(result.current.auction?.id).toBe('a1');
    expect(result.current.room?.isMember).toBe(true);
    expect(result.current.teams.length).toBe(1);
    expect(result.current.currentPlayer?.name).toBe('Player One');
    expect(result.current.status).toBe(200);
  });

  it('sets a 404 status and membership error for non-members', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    );
    const { result } = renderHook(() => useAuctionState('a1', 'r1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toBe(404);
    expect(result.current.error).toMatch(/not a member/i);
  });

  it('caches results within the stale window across hook instances', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const first = renderHook(() => useAuctionState('a1', 'r1'));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useAuctionState('a1', 'r1'));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    // Cache hit — no additional network request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.result.current.auction?.id).toBe('a1');
  });

  it('refetch bypasses the cache', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuctionState('a1', 'r1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const { result } = renderHook(() => useAuctionState('a1', 'r1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('boom');
  });
});
