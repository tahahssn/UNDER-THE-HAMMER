'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import {
  BreakStartedPayload,
  BreakAdjustedPayload,
  BreakEndedPayload,
  isBreakStartedPayload,
} from '@/lib/socket-events';

export interface BreakStatus {
  id: string;
  startedAt: Date;
  deadline: Date;
  secondsRemaining: number;
  originalDurationSeconds: number;
  reason?: string;
  isExpired: boolean;
}

/**
 * useBreakSocket: Hook to subscribe to break-related Socket.IO events.
 * Handles: break:started, break:adjusted (extended/reduced), break:ended
 * Provides methods to trigger host actions and track break state.
 * Type-safe event handling with payload validation.
 *
 * @param auctionId - Auction ID for event subscription
 * @returns Break state and host control methods
 */
export const useBreakSocket = (auctionId: string) => {
  const socket = useSocket();
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);
  const [isBreakActive, setIsBreakActive] = useState(false);

  // Subscribe to break events
  useEffect(() => {
    if (!socket) return;

    // Break started
    const handleBreakStarted = (payload: unknown) => {
      if (!isBreakStartedPayload(payload)) {
        console.error('Invalid break:started payload:', payload);
        return;
      }

      const data = payload as BreakStartedPayload;
      const status: BreakStatus = {
        id: data.breakId,
        startedAt: new Date(data.startedAt),
        deadline: new Date(data.deadline),
        secondsRemaining: data.durationSeconds,
        originalDurationSeconds: data.durationSeconds,
        reason: data.reason,
        isExpired: false,
      };
      setBreakStatus(status);
      setIsBreakActive(true);
    };

    // Break adjusted (extended or reduced)
    const handleBreakAdjusted = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        console.error('Invalid break:adjusted payload:', payload);
        return;
      }

      const data = payload as BreakAdjustedPayload;
      setBreakStatus((prev) =>
        prev
          ? {
              ...prev,
              deadline: new Date(data.newDeadline),
            }
          : null
      );
    };

    // Break ended
    const handleBreakEnded = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        console.error('Invalid break:ended payload:', payload);
        return;
      }

      const data = payload as BreakEndedPayload;
      setBreakStatus(null);
      setIsBreakActive(false);
    };

    socket.on(`auction:${auctionId}:break:started`, handleBreakStarted);
    socket.on(`auction:${auctionId}:break:adjusted`, handleBreakAdjusted);
    socket.on(`auction:${auctionId}:break:ended`, handleBreakEnded);

    return () => {
      socket.off(`auction:${auctionId}:break:started`, handleBreakStarted);
      socket.off(`auction:${auctionId}:break:adjusted`, handleBreakAdjusted);
      socket.off(`auction:${auctionId}:break:ended`, handleBreakEnded);
    };
  }, [socket, auctionId]);

  // Host actions (type-safe)
  const extendBreak = useCallback(
    async (extensionSeconds: number) => {
      if (!socket) throw new Error('Socket not connected');
      return new Promise((resolve, reject) => {
        socket.emit(
          'break:extend',
          { auctionId, additionalSeconds: extensionSeconds },
          (err: unknown, result: unknown) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });
    },
    [socket, auctionId]
  );

  const reduceBreak = useCallback(
    async (reductionSeconds: number) => {
      if (!socket) throw new Error('Socket not connected');
      return new Promise((resolve, reject) => {
        socket.emit(
          'break:reduce',
          { auctionId, reduceBySeconds: reductionSeconds },
          (err: unknown, result: unknown) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });
    },
    [socket, auctionId]
  );

  const endBreak = useCallback(async () => {
    if (!socket) throw new Error('Socket not connected');
    return new Promise((resolve, reject) => {
      socket.emit('break:end', { auctionId }, (err: unknown, result: unknown) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }, [socket, auctionId]);

  return {
    breakStatus,
    isBreakActive,
    extendBreak,
    reduceBreak,
    endBreak,
  };
};
