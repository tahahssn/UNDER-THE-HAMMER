'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';

/**
 * useRoomSocket: Manages room join/leave lifecycle
 * 
 * Emits room:join on mount and room:leave on unmount.
 * Handles reconnection by re-emitting join.
 * 
 * @param roomId - Room ID to join
 * @param role - User role (HOST, TEAM_OWNER, SPECTATOR)
 * @param teamId - Optional team ID if user is team owner
 */
export function useRoomSocket(
  roomId: string,
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR',
  teamId?: string
) {
  const socket = useSocket();
  const hasJoinedRef = useRef(false);

  // Join room
  const joinRoom = useCallback(() => {
    if (!socket || !roomId) return;

    socket.emit('room:join', {
      roomId,
      role,
      teamId,
      auctionId: roomId, // Backend may expect this
    });

    hasJoinedRef.current = true;
  }, [socket, roomId, role, teamId]);

  // Leave room
  const leaveRoom = useCallback(() => {
    if (!socket || !roomId) return;

    socket.emit('room:leave', { roomId });
    hasJoinedRef.current = false;
  }, [socket, roomId]);

  // Join on mount and when roomId changes
  useEffect(() => {
    if (!socket || !roomId || hasJoinedRef.current) return;

    joinRoom();

    return () => {
      leaveRoom();
    };
  }, [socket, roomId, joinRoom, leaveRoom]);

  // Rejoin on reconnect
  useEffect(() => {
    if (!socket) return;

    const handleReconnect = () => {
      if (hasJoinedRef.current) {
        joinRoom();
      }
    };

    socket.on('connect', handleReconnect);

    return () => {
      socket.off('connect', handleReconnect);
    };
  }, [socket, joinRoom]);

  return { joinRoom, leaveRoom };
}
