'use client';

import React, { useState } from 'react';
import { ChevronDown, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { usePresence, Participant } from '@/hooks/usePresence';
import Avatar from '@/components/Avatar';

interface RoomPresenceProps {
  roomId: string;
  currentUserId: string;
  activeBidderId?: string;
}

/**
 * RoomPresence: Displays room participant list and status
 * 
 * Features:
 * - List of room participants: avatar, name, role badge (Host/Owner/Spectator)
 * - Connection state indicator (green/amber/red dot)
 * - Highlight active bidder (yellow border or badge)
 * - Expandable on mobile (drawer or modal)
 * - Sort: host first, then team owners, then spectators
 */
export default function RoomPresence({
  roomId,
  currentUserId,
  activeBidderId,
}: RoomPresenceProps) {
  const { participants, isLoading, error } = usePresence(roomId);
  const [isExpanded, setIsExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="animate-pulse">
          <div className="mb-2 h-5 w-24 rounded bg-bg"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-bg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Sort participants: host, then team owners, then spectators
  const sorted = [...participants].sort((a, b) => {
    const roleOrder = { HOST: 0, TEAM_OWNER: 1, SPECTATOR: 2 };
    return roleOrder[a.role] - roleOrder[b.role];
  });

  const participantCount = sorted.length;

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 hover:bg-bg/50 transition-colors"
      >
        <div>
          <h3 className="font-semibold text-text">Participants</h3>
          <p className="text-xs text-text-muted">{participantCount} in room</p>
        </div>
        <ChevronDown
          size={20}
          className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Participant List */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto space-y-2 px-4 py-3">
          {sorted.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">No participants yet</p>
          ) : (
            sorted.map((participant) => (
              <ParticipantItem
                key={participant.userId}
                participant={participant}
                isYou={participant.userId === currentUserId}
                isActiveBidder={participant.userId === activeBidderId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Individual participant item
 */
function ParticipantItem({
  participant,
  isYou,
  isActiveBidder,
}: {
  participant: Participant;
  isYou: boolean;
  isActiveBidder: boolean;
}) {
  const connectionColor = {
    connected: 'bg-success',
    reconnecting: 'bg-warning',
    disconnected: 'bg-danger',
  }[participant.connectionState];

  const roleLabel = {
    HOST: 'Host',
    TEAM_OWNER: 'Owner',
    SPECTATOR: 'Spectator',
  }[participant.role];

  const roleColor = {
    HOST: 'bg-accent text-white',
    TEAM_OWNER: 'bg-info/20 text-info',
    SPECTATOR: 'bg-muted text-text-muted',
  }[participant.role];

  return (
    <div
      className={`flex items-center gap-3 rounded p-2 transition-colors ${
        isActiveBidder ? 'border-2 border-warning bg-bg' : 'hover:bg-bg'
      } ${isYou ? 'ring-2 ring-accent ring-opacity-50' : ''}`}
    >
      {/* Avatar */}
      <div className="relative">
        <Avatar userId={participant.userId} size="sm" />
        {/* Connection indicator dot */}
        <div className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-surface ${connectionColor}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text truncate">
            {isYou ? 'You' : `User ${participant.userId.slice(0, 8)}`}
          </span>
          <span className={`text-xs rounded px-2 py-0.5 whitespace-nowrap ${roleColor}`}>
            {roleLabel}
          </span>
          {isActiveBidder && (
            <span className="text-xs bg-warning text-black px-2 py-0.5 rounded whitespace-nowrap font-medium">
              🔨 Bidding
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted">
          {formatConnState(participant.connectionState)}
        </p>
      </div>
    </div>
  );
}

/**
 * Format connection state for display
 */
function formatConnState(state: string): string {
  const labels = {
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected',
  };
  return labels[state as keyof typeof labels] || state;
}
