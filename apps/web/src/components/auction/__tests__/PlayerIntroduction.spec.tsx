import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PlayerIntroduction } from '../PlayerIntroduction';
import { AuctionPlayer, LeadingTeam } from '@/lib/auction-live';

afterEach(cleanup);

const player: AuctionPlayer = {
  id: 'p1',
  name: 'Babar Azam',
  role: 'Batter',
  category: 'Platinum',
  basePriceMinor: 20_000_000, // PKR 2 L
  currency: 'PKR',
};

describe('PlayerIntroduction', () => {
  it('shows a loading skeleton when isLoading is true', () => {
    render(
      <PlayerIntroduction player={null} leadingTeam={null} isLoading />
    );
    expect(screen.getByRole('status', { name: /loading player/i })).toBeTruthy();
  });

  it('shows an empty state when no player is active', () => {
    render(<PlayerIntroduction player={null} leadingTeam={null} />);
    expect(screen.getByText(/waiting for the next player/i)).toBeTruthy();
  });

  it('formats player name, role, category and base price', () => {
    render(<PlayerIntroduction player={player} leadingTeam={null} />);
    expect(screen.getByRole('heading', { name: 'Babar Azam' })).toBeTruthy();
    expect(screen.getByText('Batter')).toBeTruthy();
    expect(screen.getByText('Platinum')).toBeTruthy();
    expect(screen.getByText(/PKR 2\.00 L/)).toBeTruthy();
    expect(screen.getByText(/no bids yet/i)).toBeTruthy();
  });

  it('shows the leading team badge when provided', () => {
    const leading: LeadingTeam = {
      id: 't1',
      name: 'Peshawar Zalmi',
      amountMinor: 30_000_000,
    };
    render(<PlayerIntroduction player={player} leadingTeam={leading} />);
    expect(screen.getByText('Peshawar Zalmi')).toBeTruthy();
    expect(screen.getByText(/PKR 3\.00 L/)).toBeTruthy();
  });
});
