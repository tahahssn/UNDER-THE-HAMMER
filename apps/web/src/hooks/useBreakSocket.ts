'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

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
 * Hook to subscribe to break-related Socket.IO events.
 * Handles: break:started, break:extended, break:reduced, break:ended
 * Provides methods to trigger host actions and track break state.
 */
export const useBreakSocket = (auctionId: string) => {
  const socket = useSocket();
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);
  const [isBreakActive, setIsBreakActive] = useState(false);

  // Subscribe to break events
  useEffect(() => {
    if (!socket) return;

    // Break started
    socket.on(`auction:${auctionId}:break:started`, (data: any) => {
      const status: BreakStatus = {
        id: data.breakId,
        startedAt: new Date(data.startedAt),
        deadline: new Date(data.deadline),
        secondsRemaining: data.secondsRemaining,
        originalDurationSeconds: data.originalDurationSeconds,
        reason: data.reason,
        isExpired: false,
      };
      setBreakStatus(status);
      setIsBreakActive(true);
    });

    // Break extended
    socket.on(`auction:${auctionId}:break:extended`, (data: any) => {
      setBreakStatus((prev) =>
        prev
          ? {
              ...prev,
              deadline: new Date(data.newDeadline),
            }
          : null
      );
    });

    // Break reduced
    socket.on(`auction:${auctionId}:break:reduced`, (data: any) => {
      setBreakStatus((prev) =>
        prev
          ? {
              ...prev,
              deadline: new Date(data.newDeadline),
            }
          : null
      );
    });

    // Break ended
    socket.on(`auction:${auctionId}:break:ended`, (data: any) => {
      setBreakStatus(null);
      setIsBreakActive(false);
    });

    return () => {
      socket.off(`auction:${auctionId}:break:started`);
      socket.off(`auction:${auctionId}:break:extended`);
      socket.off(`auction:${auctionId}:break:reduced`);
      socket.off(`auction:${auctionId}:break:ended`);
    };
  }, [socket, auctionId]);

  // Host actions
  const extendBreak = useCallback(
    async (extensionSeconds: number) => {
      if (!socket) throw new Error('Socket not connected');
      return new Promise((resolve, reject) => {
        socket.emit(
          'break:extend',
          { auctionId, extensionSeconds },
          (err: any, result: any) => {
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
          { auctionId, reductionSeconds },
          (err: any, result: any) => {
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
      socket.emit('break:end', { auctionId }, (err: any, result: any) => {
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
