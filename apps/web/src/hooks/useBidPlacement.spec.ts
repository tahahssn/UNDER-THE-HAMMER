import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBidPlacement } from './useBidPlacement';

vi.mock('./useSocket', () => ({ useSocket: vi.fn() }));
import { useSocket } from './useSocket';

function makeSocket(connected = true) {
  const handlers: Record<string, Array<(p: unknown) => void>> = {};
  return {
    connected,
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

const baseOpts = {
  auctionId: 'a1',
  teamId: 't1',
  auctionPlayerId: 'p1',
  stateVersion: 2,
};

let socket: ReturnType<typeof makeSocket>;

beforeEach(() => {
  socket = makeSocket(true);
  (useSocket as unknown as ReturnType<typeof vi.fn>).mockReturnValue(socket);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useBidPlacement', () => {
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

  it('submits a bid over the socket with the authoritative payload and key', async () => {
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

    const [event, payload] = socket.emit.mock.calls[0];
    expect(event).toBe('bid:submit');
    expect(payload).toMatchObject({
      auctionId: 'a1',
      auctionPlayerId: 'p1',
      auctionTeamId: 't1',
      amountMinor: '15000000',
      stateVersion: 2,
    });
    expect(typeof payload.idempotencyKey).toBe('string');
    expect(result.current.lastIdempotencyKey).toBe(payload.idempotencyKey);
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

  it('rejects an invalid amount without emitting', async () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    let ok = true;
    await act(async () => {
      ok = await result.current.submitBid(0);
    });
    expect(ok).toBe(false);
    expect(result.current.error?.code).toBe('INVALID_INCREMENT');
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('maps a server rejection carrying the idempotency key to a user error', async () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    await act(async () => {
      await result.current.submitBid(9_000_000);
    });
    const key = result.current.lastIdempotencyKey;

    act(() => {
      socket._emit('bid:rejected', {
        code: 'INSUFFICIENT_PURSE',
        availableMinor: 5_000_000,
        idempotencyKey: key,
      });
    });

    expect(result.current.error?.code).toBe('INSUFFICIENT_PURSE');
    expect(result.current.error?.availableMinor).toBe(5_000_000);
  });

  it('ignores a rejection for a different idempotency key', async () => {
    const { result } = renderHook(() => useBidPlacement(baseOpts));
    await act(async () => {
      await result.current.submitBid(9_000_000);
    });

    act(() => {
      socket._emit('bid:rejected', {
        code: 'INSUFFICIENT_PURSE',
        idempotencyKey: 'someone-else',
      });
    });

    expect(result.current.error).toBeNull();
  });

  it('fails fast with a network error when the socket is disconnected', async () => {
    socket = makeSocket(false);
    (useSocket as unknown as ReturnType<typeof vi.fn>).mockReturnValue(socket);

    const { result } = renderHook(() => useBidPlacement(baseOpts));
    let ok = true;
    await act(async () => {
      ok = await result.current.submitBid(10_000_000);
    });

    expect(ok).toBe(false);
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
    expect(socket.emit).not.toHaveBeenCalled();
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
