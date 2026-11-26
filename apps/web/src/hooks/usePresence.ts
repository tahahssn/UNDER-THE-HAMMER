'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

export interface Participant {
  userId: string;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  teamId?: string;
  joinedAt: string;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  isYou?: boolean;
}

export interface PresenceState {
  participants: Participant[];
  activeBidderId?: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * usePresence: Tracks and displays room participant presence
 * 
 * Features:
 * - Listens to room:presence events from server
 * - On reconnect: fetches current presence snapshot
 * - Shows connection state (connected/reconnecting/disconnected) for each participant
 * - Tracks active bidder during auction
 * 
 * @param roomId - Room ID
 * @returns Presence state with participant list
 */
export function usePresence(roomId: string): PresenceState {
  const socket = useSocket();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeBidderId, setActiveBidderId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch presence snapshot
  const fetchPresence = useCallback(() => {
    if (!socket || !roomId) return;

    socket.emit('room:request-presence', {
      roomId,
      includeEvents: true,
      eventCount: 10,
    });
  }, [socket, roomId]);

  // Listen for presence updates
  useEffect(() => {
    if (!socket || !roomId) return;

    const handlePresence = (payload: any) => {
      if (payload.participants) {
        setParticipants(payload.participants);
        setIsLoading(false);
        setError(null);
      }
    };

    const handlePresenceError = (payload: any) => {
      setError(payload.message || 'Failed to fetch presence');
      setIsLoading(false);
    };

    socket.on('room:presence', handlePresence);
    socket.on('room:presence:error', handlePresenceError);

    // Fetch presence on mount
    fetchPresence();

    // Refetch presence on reconnect
    const handleReconnect = () => {
      setIsLoading(true);
      fetchPresence();
    };

    socket.on('connect', handleReconnect);

    return () => {
      socket.off('room:presence', handlePresence);
      socket.off('room:presence:error', handlePresenceError);
      socket.off('connect', handleReconnect);
    };
  }, [socket, roomId, fetchPresence]);

  // Update connection state for participants (simulate reconnecting state)
  useEffect(() => {
    if (!socket) return;

    const handleDisconnect = () => {
      setParticipants((prev) =>
        prev.map((p) => ({
          ...p,
          connectionState: p.isYou ? 'disconnected' : p.connectionState,
        }))
      );
    };

    const handleReconnecting = () => {
      setParticipants((prev) =>
        prev.map((p) => ({
          ...p,
          connectionState: p.isYou ? 'reconnecting' : p.connectionState,
        }))
      );
    };

    const handleConnect = () => {
      setParticipants((prev) =>
        prev.map((p) => ({
          ...p,
          connectionState: p.isYou ? 'connected' : p.connectionState,
        }))
      );
    };

    socket.on('disconnect', handleDisconnect);
    socket.on('reconnecting', handleReconnecting);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnecting', handleReconnecting);
      socket.off('connect', handleConnect);
    };
  }, [socket]);

  return {
    participants,
    activeBidderId,
    isLoading,
    error,
  };
}
