'use client';

import React from 'react';
import Link from 'next/link';
import { TeamListItem } from '@/lib/types';

interface TeamCardProps {
  team: TeamListItem;
}

export default function TeamCard({ team }: TeamCardProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Link href={`/teams/${team.id}`}>
      <div className="cursor-pointer overflow-hidden rounded-lg border border-border bg-surface p-4 transition-all duration-200 hover:border-primary hover:shadow-md">
        {/* Logo / Initials */}
        <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-lg font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${team.primaryColor}, ${team.secondaryColor || team.primaryColor})`
          }}>
          {getInitials(team.name)}
        </div>

        {/* Team Name */}
        <h3 className="mb-1 line-clamp-1 font-semibold text-text">{team.name}</h3>

        {/* Short Name */}
        <p className="mb-2 text-xs text-text-muted">{team.shortName}</p>

        {/* Creator */}
        <p className="text-sm text-text-muted">By {team.createdBy.displayName}</p>

        {/* Color Swatches */}
        <div className="mt-3 flex gap-2">
          <div
            className="h-6 w-6 rounded border border-border"
            style={{ background: team.primaryColor }}
            aria-label={`Primary color: ${team.primaryColor}`}
            title={team.primaryColor}
          />
          {team.secondaryColor && (
            <div
              className="h-6 w-6 rounded border border-border"
              style={{ background: team.secondaryColor }}
              aria-label={`Secondary color: ${team.secondaryColor}`}
              title={team.secondaryColor}
            />
          )}
        </div>
      </div>
    </Link>
  );
}
