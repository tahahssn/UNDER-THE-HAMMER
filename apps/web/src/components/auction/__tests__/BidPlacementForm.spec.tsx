import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { BidPlacementForm } from '../BidPlacementForm';

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

const baseProps = {
  auctionId: 'auction-1',
  roomId: 'room-1',
  teamId: 'team-1',
  auctionPlayerId: 'ap-1',
  stateVersion: 1,
  currentTeamPurse: 200_000_000,
  basePrice: 10_000_000, // next valid bid = base price (no leading bid)
  maxBid: 200_000_000,
  currency: 'PKR',
};

beforeEach(() => {
  socket = makeSocket();
  (useSocket as unknown as ReturnType<typeof vi.fn>).mockReturnValue(socket);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BidPlacementForm', () => {
  it('submits a valid bid over the socket and clears the input', async () => {
    const onSubmit = vi.fn();
    render(<BidPlacementForm {...baseProps} onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/bid amount/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '15000000' } });
    fireEvent.click(screen.getByRole('button', { name: /place bid/i }));

    // Optimistic callback fires immediately with amount + idempotency key.
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [amount, key] = onSubmit.mock.calls[0];
    expect(amount).toBe(15000000);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith(
        'bid:submit',
        expect.objectContaining({ amountMinor: '15000000', auctionTeamId: 'team-1' })
      );
      expect(input.value).toBe('');
    });
  });

  it('rejects a bid below the next valid bid with a preview message and blocks submit', () => {
    const onSubmit = vi.fn();
    render(<BidPlacementForm {...baseProps} onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/bid amount/i);
    fireEvent.change(input, { target: { value: '5000000' } });

    expect(screen.getByText(/minimum bid is/i)).toBeTruthy();
    const submit = screen.getByRole('button', { name: /place bid/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('computes the next valid bid one increment above the current leader', () => {
    // Leading at 1 crore (1e9 paisa) → +15 lakh (1.5e8 paisa) = 1.15 crore.
    render(
      <BidPlacementForm
        {...baseProps}
        currentLeadingBid={1_000_000_000}
        onSubmit={vi.fn()}
      />
    );
    const input = screen.getByLabelText(/bid amount/i) as HTMLInputElement;
    // Clicking the "next valid bid" shortcut fills the computed amount.
    fireEvent.click(screen.getByRole('button', { name: /PKR 1\.15 Cr/i }));
    expect(input.value).toBe('1150000000');
  });

  it('shows a server rejection error (INSUFFICIENT_PURSE) for this submission', async () => {
    render(<BidPlacementForm {...baseProps} onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/bid amount/i), {
      target: { value: '150000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /place bid/i }));

    const submitPayload = socket.emit.mock.calls.find(
      (c) => c[0] === 'bid:submit'
    )?.[1] as { idempotencyKey: string };

    act(() => {
      socket._emit('bid:rejected', {
        code: 'INSUFFICIENT_PURSE',
        availableMinor: 120_000_000,
        idempotencyKey: submitPayload.idempotencyKey,
      });
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('purse');
  });

  it('submits on Enter and clears input/error on Escape', async () => {
    const onSubmit = vi.fn();
    render(<BidPlacementForm {...baseProps} onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/bid amount/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '15000000' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input.value).toBe(''));

    fireEvent.change(input, { target: { value: '99999999' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('disables input and button when disabled prop is set', () => {
    render(<BidPlacementForm {...baseProps} disabled onSubmit={vi.fn()} />);
    const input = screen.getByLabelText(/bid amount/i) as HTMLInputElement;
    const submit = screen.getByRole('button', { name: /place bid/i }) as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
  });

  it('fills the next valid bid when the shortcut is clicked', () => {
    render(<BidPlacementForm {...baseProps} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /PKR 1\.00 L/i }));
    const input = screen.getByLabelText(/bid amount/i) as HTMLInputElement;
    expect(input.value).toBe('10000000');
  });
});
