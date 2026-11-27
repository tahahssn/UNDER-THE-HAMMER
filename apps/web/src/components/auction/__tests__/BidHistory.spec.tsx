import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BidHistory } from '../BidHistory';
import { BidRecord } from '@/lib/auction-live';

const scrollSpy = vi.fn();

beforeEach(() => {
  // jsdom does not implement scrollIntoView.
  (Element.prototype as any).scrollIntoView = scrollSpy;
  scrollSpy.mockClear();
});

afterEach(cleanup);

function bid(partial: Partial<BidRecord> & { id: string }): BidRecord {
  return {
    teamId: 't1',
    teamName: 'Lahore',
    amount: 10_000_000,
    timestamp: '2026-01-01T10:00:00.000Z',
    status: 'accepted',
    currency: 'PKR',
    ...partial,
  };
}

describe('BidHistory', () => {
  it('renders an empty state when there are no bids', () => {
    render(<BidHistory bids={[]} />);
    expect(screen.getByText(/no bids yet/i)).toBeTruthy();
  });

  it('renders bids with amount, team name and status badge', () => {
    render(
      <BidHistory
        bids={[
          bid({ id: 'b1', teamName: 'Karachi', amount: 12_000_000, status: 'accepted' }),
          bid({ id: 'b2', teamName: 'Multan', amount: 13_000_000, status: 'pending' }),
          bid({ id: 'b3', teamName: 'Quetta', amount: 14_000_000, status: 'rejected' }),
        ]}
      />
    );
    expect(screen.getByText('Karachi')).toBeTruthy();
    expect(screen.getByText('Accepted')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
  });

  it('only shows the most recent bids up to the limit', () => {
    const many: BidRecord[] = Array.from({ length: 20 }, (_, i) =>
      bid({ id: `b${i}`, teamName: `Team ${i}` })
    );
    render(<BidHistory bids={many} limit={15} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(15);
    // Oldest (Team 0) should have scrolled out of the window.
    expect(screen.queryByText('Team 0')).toBeNull();
    expect(screen.getByText('Team 19')).toBeTruthy();
  });

  it('auto-scrolls to the latest bid when a new bid arrives', () => {
    const { rerender } = render(
      <BidHistory bids={[bid({ id: 'b1' })]} />
    );
    scrollSpy.mockClear();
    rerender(<BidHistory bids={[bid({ id: 'b1' }), bid({ id: 'b2' })]} />);
    expect(scrollSpy).toHaveBeenCalled();
  });
});
