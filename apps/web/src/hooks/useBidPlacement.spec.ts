import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBidPlacement } from './useBidPlacement';

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ accepted: true }),
  });
}

const baseOpts = { auctionId: 'a1', teamId: 't1' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useBidPlacement', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', okFetch());
  });

  it('exposes initial form state', () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    expect(result.current.bidAmount).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.lastIdempotencyKey).toBeNull();
  });

  it('updates bidAmount via setBidAmount', () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    act(() => result.current.setBidAmount('12345'));
    expect(result.current.bidAmount).toBe('12345');
  });

  it('submits a bid with amount, teamId and a generated idempotency key', async () => {
    const onOptimistic = vi.fn();
    const { result } = renderHook(() =>
      useBidPlacement({ ...baseOpts, onOptimistic })
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.submitBid(15_000_000);
    });

    expect(ok).toBe(true);
    expect(onOptimistic).toHaveBeenCalledTimes(1);

    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/auctions/a1/bids');
    const body = JSON.parse(call[1].body);
    expect(body.amount).toBe(15_000_000);
    expect(body.teamId).toBe('t1');
    expect(typeof body.idempotencyKey).toBe('string');
    expect(result.current.lastIdempotencyKey).toBe(body.idempotencyKey);
  });

  it('generates a unique idempotency key per submission', async () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    await act(async () => {
      await result.current.submitBid(10_000_000);
    });
    const first = result.current.lastIdempotencyKey;
    await act(async () => {
      await result.current.submitBid(11_000_000);
    });
    const second = result.current.lastIdempotencyKey;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it('rejects an invalid amount without calling the API', async () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    let ok = true;
    await act(async () => {
      ok = await result.current.submitBid(0);
    });
    expect(ok).toBe(false);
    expect(result.current.error?.code).toBe('INVALID_INCREMENT');
    expect((global.fetch as any)).not.toHaveBeenCalled();
  });

  it('maps a server rejection code to a user-facing error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ code: 'INSUFFICIENT_PURSE', availableMinor: 5_000_000 }),
      })
    );
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    let ok = true;
    await act(async () => {
      ok = await result.current.submitBid(9_000_000);
    });
    expect(ok).toBe(false);
    expect(result.current.error?.code).toBe('INSUFFICIENT_PURSE');
    expect(result.current.error?.availableMinor).toBe(5_000_000);
  });

  it('retries on transient network failure then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useBidPlacement({ ...baseOpts, retryDelayMs: 1, maxRetries: 2 })
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.submitBid(10_000_000);
    });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useBidPlacement({ ...baseOpts, retryDelayMs: 1, maxRetries: 1 })
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.submitBid(10_000_000);
    });

    expect(ok).toBe(false);
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('clears the error via clearError', async () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    await act(async () => {
      await result.current.submitBid(0);
    });
    expect(result.current.error).not.toBeNull();
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
