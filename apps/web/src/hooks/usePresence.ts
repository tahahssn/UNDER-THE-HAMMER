'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import {
  RoomPresencePayload,
  PresenceUpdatePayload,
  PresenceHeartbeatRequest,
  isPresenceParticipant,
  PresenceParticipant,
} from '@/lib/socket-events';

export interface Participant {
  userId: string;
  userName: string;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  teamId?: string;
  teamName?: string;
  joinedAt: string;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  isYou?: boolean;
  isOnline: boolean;
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
 * - Listens to room:presence events from server (type-safe)
 * - On reconnect: fetches current presence snapshot from server
 * - Shows connection state (connected/reconnecting/disconnected) for each participant
 * - Tracks active bidder during auction
 * - Server broadcasts presence updates on participant connect/disconnect
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

    const handlePresence = (payload: unknown) => {
      // Type-safe validation using socket-events contract
      if (!payload || typeof payload !== 'object') {
        setError('Invalid presence payload');
        setIsLoading(false);
        return;
      }

      // Validate payload structure
      const presencePayload = payload as RoomPresencePayload;

      if (!presencePayload.participants || !Array.isArray(presencePayload.participants)) {
        setError('Invalid presence data structure');
        setIsLoading(false);
        return;
      }

      try {
        // Map server participants to Participant interface
        const mappedParticipants: Participant[] = presencePayload.participants
          .filter(isPresenceParticipant)
          .map((p: PresenceParticipant) => ({
            userId: p.userId,
            userName: p.userName,
            role: p.role,
            teamId: p.teamId,
            teamName: p.teamName,
            joinedAt: p.connectedAt,
            connectionState: p.isOnline ? 'connected' : 'disconnected',
            isOnline: p.isOnline,
          }));

        setParticipants(mappedParticipants);

        if (presencePayload.activeBidderId) {
          setActiveBidderId(presencePayload.activeBidderId);
        }

        setIsLoading(false);
        setError(null);
      } catch (err) {
        setError('Failed to process presence data');
        setIsLoading(false);
      }
    };

    const handlePresenceUpdate = (payload: unknown) => {
      // Handle individual participant updates (broadcast by server)
      // Type-safe validation
      if (!payload || typeof payload !== 'object') {
        return;
      }

      try {
        const updatePayload = payload as PresenceUpdatePayload;

        // Validate required fields
        if (!updatePayload.userId || !updatePayload.status) {
          return;
        }

        setParticipants((prev) => {
          return prev.map((p) => {
            if (p.userId === updatePayload.userId) {
              return {
                ...p,
                connectionState: updatePayload.status as 'connected' | 'disconnected' | 'reconnecting',
                isOnline: updatePayload.status !== 'disconnected',
              };
            }
            return p;
          });
        });
      } catch (err) {
        console.error('Error processing presence update:', err);
      }
    };

    const handlePresenceError = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        setError('Presence error');
      } else {
        const errorPayload = payload as { message?: string };
        setError(errorPayload.message || 'Failed to fetch presence');
      }
      setIsLoading(false);
    };

    socket.on('room:presence', handlePresence);
    socket.on('room:presence:update', handlePresenceUpdate);
    socket.on('room:presence:error', handlePresenceError);

    // Fetch presence on mount
    fetchPresence();

    // Refetch presence on reconnect to recover server state
    const handleReconnect = () => {
      setIsLoading(true);
      fetchPresence();
    };

    socket.on('connect', handleReconnect);

    return () => {
      socket.off('room:presence', handlePresence);
      socket.off('room:presence:update', handlePresenceUpdate);
      socket.off('room:presence:error', handlePresenceError);
      socket.off('connect', handleReconnect);
    };
  }, [socket, roomId, fetchPresence]);

  // Update local connection state for current user
  useEffect(() => {
    if (!socket) return;

    const handleDisconnect = () => {
      setParticipants((prev) =>
        prev.map((p) => ({
          ...p,
          connectionState: p.isYou ? 'disconnected' : p.connectionState,
          isOnline: p.isYou ? false : p.isOnline,
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
          isOnline: p.isYou ? true : p.isOnline,
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
