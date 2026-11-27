'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import {
  TeamStanding,
  formatMoney,
  resolveCurrency,
} from '@/lib/auction-live';

export interface TeamStandingsProps {
  teams: TeamStanding[];
  /** Sort order: by remaining purse (desc) or alphabetically by name. */
  sortBy?: 'purse' | 'alpha';
}

function sortTeams(teams: TeamStanding[], sortBy: 'purse' | 'alpha'): TeamStanding[] {
  const copy = [...teams];
  if (sortBy === 'alpha') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => b.purse - a.purse);
  }
  return copy;
}

function TeamLogo({ team }: { team: TeamStanding }) {
  if (team.logo) {
    return (
      <Image
        src={team.logo}
        alt={`${team.name} logo`}
        width={32}
        height={32}
        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
      />
    );
  }
  // Fallback: initials monogram (no hard-coded brand imagery).
  const initials = team.name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs font-semibold text-text-muted"
    >
      {initials}
    </span>
  );
}

/**
 * TeamStandings: responsive grid of all participating teams.
 *
 * The team count is driven entirely by the `teams` prop (never hard-coded to
 * eight). The grid scales from one column on mobile up to four on wide
 * displays using Tailwind breakpoint utilities (1 / 2 / 3 / 4 cols at
 * 375 / 768 / 1024 / 1440). Each card shows the team logo (or an initials
 * fallback), remaining purse, and a compact squad-progress bar.
 */
export function TeamStandings({ teams, sortBy = 'purse' }: TeamStandingsProps) {
  const sorted = useMemo(() => sortTeams(teams, sortBy), [teams, sortBy]);

  if (sorted.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
        No teams in this auction yet.
      </p>
    );
  }

  return (
    <section aria-label="Team standings">
      <h2 className="mb-3 text-sm font-semibold text-text-muted">
        Teams ({sorted.length})
      </h2>
      <ul
        role="list"
        className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
      >
        {sorted.map((team) => {
          const currency = resolveCurrency(team.currency);
          const max = team.maxSquadSize > 0 ? team.maxSquadSize : 0;
          const progress =
            max > 0
              ? Math.min(100, Math.round((team.squadCount / max) * 100))
              : 0;
          return (
            <li
              key={team.id}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex items-center gap-2">
                <TeamLogo team={team} />
                <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">
                  {team.name}
                </span>
              </div>

              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-text-muted">Purse</dt>
                  <dd className="font-semibold tabular-nums text-text-primary">
                    {formatMoney(team.purse, currency)}
                  </dd>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Squad</dt>
                    <dd className="tabular-nums text-text-primary">
                      {team.squadCount}
                      {max > 0 ? ` / ${max}` : ''}
                    </dd>
                  </div>
                  <div
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
                    role="progressbar"
                    aria-label={`${team.name} squad progress`}
                    aria-valuenow={team.squadCount}
                    aria-valuemin={0}
                    aria-valuemax={max || undefined}
                  >
                    <div
                      className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default TeamStandings;
