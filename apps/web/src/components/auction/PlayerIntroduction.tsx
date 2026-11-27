'use client';

import React from 'react';
import Badge from '@/components/Badge';
import {
  AuctionPlayer,
  LeadingTeam,
  formatMoney,
  resolveCurrency,
} from '@/lib/auction-live';

export interface PlayerIntroductionProps {
  player: AuctionPlayer | null;
  leadingTeam: LeadingTeam | null;
  isLoading?: boolean;
}

/**
 * PlayerIntroduction: headline card for the player currently on the block.
 *
 * Shows name, role and category as badges, the base price in the player's
 * currency, and the leading team when a bid has been accepted. Renders a
 * skeleton while loading and an empty state when no player is active.
 */
export function PlayerIntroduction({
  player,
  leadingTeam,
  isLoading = false,
}: PlayerIntroductionProps) {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading player"
        className="rounded-lg border border-border bg-surface p-6"
      >
        <div className="h-7 w-48 animate-pulse rounded bg-surface-raised" />
        <div className="mt-3 flex gap-2">
          <div className="h-6 w-20 animate-pulse rounded-full bg-surface-raised" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-surface-raised" />
        </div>
        <div className="mt-4 h-5 w-32 animate-pulse rounded bg-surface-raised" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">
        <p className="text-sm">Waiting for the next player to be introduced.</p>
      </div>
    );
  }

  const currency = resolveCurrency(player.currency);

  return (
    <article
      aria-label={`Current player: ${player.name}`}
      className="rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
            {player.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {player.role && <Badge variant="info">{player.role}</Badge>}
            {player.category && (
              <Badge variant="neutral">{player.category}</Badge>
            )}
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Base price
          </p>
          <p className="text-xl font-semibold text-text-primary sm:text-2xl">
            {formatMoney(player.basePriceMinor, currency)}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        {leadingTeam ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-muted">Leading</span>
            <span className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-text-primary">
                {leadingTeam.name}
              </span>
              <Badge variant="success">
                {formatMoney(leadingTeam.amountMinor, currency)}
              </Badge>
            </span>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No bids yet.</p>
        )}
      </div>
    </article>
  );
}

export default PlayerIntroduction;
