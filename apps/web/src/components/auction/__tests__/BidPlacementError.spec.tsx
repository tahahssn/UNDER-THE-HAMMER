import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BidPlacementError } from '../BidPlacementError';
import { BidError } from '@/lib/auction-live';

afterEach(cleanup);

describe('BidPlacementError', () => {
  it('renders nothing when error is null', () => {
    const { container } = render(
      <BidPlacementError error={null} onDismiss={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('maps INSUFFICIENT_PURSE to a message with available purse', () => {
    const error: BidError = {
      code: 'INSUFFICIENT_PURSE',
      availableMinor: 1_500_000_000, // PKR 1.5 Cr in paisa
      currency: 'PKR',
    };
    render(<BidPlacementError error={error} onDismiss={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('purse');
    expect(alert.textContent).toContain('PKR');
    expect(alert.textContent).toContain('1.50 Cr');
  });

  it('maps INVALID_INCREMENT to a minimum-bid suggestion', () => {
    const error: BidError = {
      code: 'INVALID_INCREMENT',
      minimumBidMinor: 11_000_000,
      currency: 'PKR',
    };
    render(<BidPlacementError error={error} onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('increment');
  });

  it.each([
    ['UNAUTHORIZED_TEAM', 'not allowed'],
    ['PLAYER_SOLD', 'already been sold'],
    ['AUCTION_NOT_ACTIVE', 'not currently accepting'],
    ['BID_AFTER_DEADLINE', 'bidding window has closed'],
    ['DUPLICATE_IDEMPOTENCY_KEY', 'already submitted'],
  ])('maps %s to a user-friendly message', (code, expected) => {
    render(
      <BidPlacementError error={{ code }} onDismiss={() => {}} />
    );
    expect(screen.getByRole('alert').textContent?.toLowerCase()).toContain(
      expected.toLowerCase()
    );
  });

  it('falls back to a generic message for unknown codes', () => {
    render(
      <BidPlacementError
        error={{ code: 'SOMETHING_ELSE', message: 'boom' }}
        onDismiss={() => {}}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain('could not be placed');
  });

  it('invokes onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <BidPlacementError error={{ code: 'PLAYER_SOLD' }} onDismiss={onDismiss} />
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss error/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
