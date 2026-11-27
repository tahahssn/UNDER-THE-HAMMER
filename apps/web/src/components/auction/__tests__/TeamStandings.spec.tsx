import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { TeamStandings } from '../TeamStandings';
import { TeamStanding } from '@/lib/auction-live';

// Render next/image as a plain img in tests.
vi.mock('next/image', () => ({
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

afterEach(cleanup);

function team(partial: Partial<TeamStanding> & { id: string; name: string }): TeamStanding {
  return {
    logo: null,
    purse: 100_000_000,
    squadCount: 2,
    maxSquadSize: 15,
    currency: 'PKR',
    ...partial,
  };
}

describe('TeamStandings', () => {
  it('renders an empty state when there are no teams', () => {
    render(<TeamStandings teams={[]} />);
    expect(screen.getByText(/no teams in this auction/i)).toBeTruthy();
  });

  it('renders exactly the number of teams provided (not hard-coded to 8)', () => {
    const three = [team({ id: 'a', name: 'A' }), team({ id: 'b', name: 'B' }), team({ id: 'c', name: 'C' })];
    const { rerender } = render(<TeamStandings teams={three} />);
    expect(screen.getAllByRole('listitem').length).toBe(3);

    const eleven = Array.from({ length: 11 }, (_, i) =>
      team({ id: `t${i}`, name: `Team ${i}` })
    );
    rerender(<TeamStandings teams={eleven} />);
    expect(screen.getAllByRole('listitem').length).toBe(11);
  });

  it('uses responsive Tailwind grid columns (1 / 2 / 3 / 4)', () => {
    render(<TeamStandings teams={[team({ id: 'a', name: 'A' })]} />);
    const list = screen.getByRole('list');
    expect(list.className).toContain('grid-cols-1');
    expect(list.className).toContain('md:grid-cols-2');
    expect(list.className).toContain('lg:grid-cols-3');
    expect(list.className).toContain('2xl:grid-cols-4');
  });

  it('sorts by remaining purse descending by default', () => {
    render(
      <TeamStandings
        teams={[
          team({ id: 'low', name: 'Low', purse: 10_000_000 }),
          team({ id: 'high', name: 'High', purse: 90_000_000 }),
          team({ id: 'mid', name: 'Mid', purse: 50_000_000 }),
        ]}
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('High')).toBeTruthy();
    expect(within(items[2]).getByText('Low')).toBeTruthy();
  });

  it('sorts alphabetically when sortBy is alpha', () => {
    render(
      <TeamStandings
        sortBy="alpha"
        teams={[
          team({ id: 'z', name: 'Zalmi', purse: 90_000_000 }),
          team({ id: 'a', name: 'Alpha', purse: 10_000_000 }),
        ]}
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Alpha')).toBeTruthy();
  });

  it('renders a logo image when available and initials fallback otherwise', () => {
    render(
      <TeamStandings
        teams={[
          team({ id: 'logo', name: 'Islamabad United', logo: 'https://cdn.example.com/u.png' }),
          team({ id: 'noLogo', name: 'Quetta Gladiators', logo: null }),
        ]}
      />
    );
    const img = screen.getByAltText(/islamabad united logo/i) as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('https://cdn.example.com/u.png');
    // Initials monogram for the team without a logo.
    expect(screen.getByText('QG')).toBeTruthy();
  });

  it('exposes a squad progress bar with aria values', () => {
    render(
      <TeamStandings
        teams={[team({ id: 'a', name: 'A', squadCount: 6, maxSquadSize: 12 })]}
      />
    );
    const bar = screen.getByRole('progressbar', { name: /A squad progress/i });
    expect(bar.getAttribute('aria-valuenow')).toBe('6');
    expect(bar.getAttribute('aria-valuemax')).toBe('12');
  });
});
