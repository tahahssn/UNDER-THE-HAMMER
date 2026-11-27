import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { BidPlacementForm } from '../BidPlacementForm';

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ accepted: true }),
  });
}

function mockFetchReject(code: string, extra: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ code, ...extra }),
  });
}

const baseProps = {
  auctionId: 'auction-1',
  roomId: 'room-1',
  teamId: 'team-1',
  currentTeamPurse: 200_000_000,
  minimumBid: 10_000_000,
  maxBid: 200_000_000,
  currency: 'PKR',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BidPlacementForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchOk());
  });

  it('submits a valid bid and clears the input', async () => {
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
      expect((global.fetch as any)).toHaveBeenCalledTimes(1);
      expect(input.value).toBe('');
    });
  });

  it('rejects a bid below the minimum with a preview message and blocks submit', () => {
    const onSubmit = vi.fn();
    render(<BidPlacementForm {...baseProps} onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/bid amount/i);
    fireEvent.change(input, { target: { value: '5000000' } });

    expect(screen.getByText(/minimum bid is/i)).toBeTruthy();
    const submit = screen.getByRole('button', { name: /place bid/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server rejection error (INSUFFICIENT_PURSE)', async () => {
    vi.stubGlobal('fetch', mockFetchReject('INSUFFICIENT_PURSE', { availableMinor: 120_000_000 }));
    render(<BidPlacementForm {...baseProps} onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/bid amount/i), {
      target: { value: '150000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /place bid/i }));

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

  it('fills the minimum bid when the minimum shortcut is clicked', () => {
    render(<BidPlacementForm {...baseProps} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /PKR 1\.00 L/i }));
    const input = screen.getByLabelText(/bid amount/i) as HTMLInputElement;
    expect(input.value).toBe('10000000');
  });
});
