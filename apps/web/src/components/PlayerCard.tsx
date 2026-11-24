'use client';

import React from 'react';
import Link from 'next/link';
import { PlayerListItem } from '@/lib/types';
import Badge from './Badge';

interface PlayerCardProps {
  player: PlayerListItem;
}

export default function PlayerCard({ player }: PlayerCardProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: string) => {
    const roleMap: Record<string, string> = {
      BATTER: 'Batter',
      BOWLER: 'Bowler',
      ALL_ROUNDER: 'All-rounder',
      WICKETKEEPER: 'Wicket-keeper',
    };
    return roleMap[role] || role;
  };

  return (
    <Link href={`/players/${player.id}`}>
      <div className="cursor-pointer overflow-hidden rounded-lg border border-border bg-surface p-4 transition-all duration-200 hover:border-primary hover:shadow-md">
        {/* Avatar */}
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
          {getInitials(player.displayName)}
        </div>

        {/* Name */}
        <h3 className="mb-1 line-clamp-1 font-semibold text-text">{player.displayName}</h3>

        {/* Role Badge */}
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="info" className="text-xs">
            {getRoleLabel(player.role)}
          </Badge>
        </div>

        {/* Category and Country */}
        <div className="space-y-1 text-sm text-text-muted">
          {player.category && <p className="line-clamp-1">{player.category.name}</p>}
          {player.country && <p className="line-clamp-1">{player.country.name}</p>}
        </div>

        {/* Stats Preview (empty if not available) */}
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs text-text-muted">Data unavailable</p>
        </div>
      </div>
    </Link>
  );
}
