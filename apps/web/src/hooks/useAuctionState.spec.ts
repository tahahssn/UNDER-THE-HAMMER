import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuctionState, __clearAuctionStateCache } from './useAuctionState';

const detail = {
  id: 'a1',
  roomId: 'r1',
  phase: 'LIVE',
  stateVersion: 3,
  currency: 'PKR',
  currentAuctionPlayerId: 'ap1',
  highBidMinor: '12000000',
  highBidTeamId: 't1',
  room: { id: 'r1', name: 'Mega Auction', hostId: 'host-1' },
  players: [
    { id: 'ap1', basePriceMinor: '10000000' },
    { id: 'ap2', basePriceMinor: '8000000' },
  ],
};

const teams = [
  {
    id: 't1',
    team: { name: 'Lahore', currentLogo: { url: 'https://cdn/x.png' } },
    purseBalanceMinor: '150000000',
    acquisitions: [{ id: 'acq1' }, { id: 'acq2' }],
  },
];

const rules = [
  { id: 'rule1', type: 'ROLE_MIN', role: 'Batter', minCount: 3, maxCount: 7, category: null },
];

/** Route a mocked fetch by URL suffix. */
function routedFetch() {
  return vi.fn().mockImplementation((url: string) => {
    const ok = (data: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: async () => data });
    if (url.endsWith('/teams')) return ok(teams);
    if (url.endsWith('/squads/rules')) return ok(rules);
    return ok(detail);
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
  it('fetches the v1 endpoints on mount and maps the result', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuctionState('a1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const detailUrl = fetchMock.mock.calls[0][0] as string;
    expect(detailUrl).toContain('/api/v1/auctions/a1');
    expect(detailUrl).not.toContain('/state');

    expect(result.current.status).toBe(200);
    expect(result.current.auction?.id).toBe('a1');
    expect(result.current.auction?.stateVersion).toBe(3);
    expect(result.current.auction?.highBidMinor).toBe(12_000_000);
    expect(result.current.room?.name).toBe('Mega Auction');
    expect(result.current.room?.hostId).toBe('host-1');
    expect(result.current.teams).toHaveLength(1);
    expect(result.current.teams[0].purse).toBe(150_000_000);
    expect(result.current.teams[0].squadCount).toBe(2);
    expect(result.current.teams[0].logo).toBe('https://cdn/x.png');
    expect(result.current.basePriceByPlayerId.ap1).toBe(10_000_000);
    expect(result.current.squadRequirements).toHaveLength(1);
    expect(result.current.squadRequirements[0].minCount).toBe(3);
  });

  it('sets a 404 status for a missing auction', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    );
    const { result } = renderHook(() => useAuctionState('a1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toBe(404);
    expect(result.current.error).toMatch(/not found/i);
  });

  it('caches results within the stale window across hook instances', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);

    const first = renderHook(() => useAuctionState('a1'));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    const callsAfterFirst = fetchMock.mock.calls.length;

    const second = renderHook(() => useAuctionState('a1'));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    // Cache hit — no additional network requests.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(second.result.current.auction?.id).toBe('a1');
  });

  it('refetch bypasses the cache', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuctionState('a1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsAfterFirst = fetchMock.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('surfaces network errors without a 404 status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const { result } = renderHook(() => useAuctionState('a1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.status).toBeNull();
  });
});
