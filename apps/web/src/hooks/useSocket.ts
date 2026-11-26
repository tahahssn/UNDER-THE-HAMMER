'use client';

import { useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket, isSocketConnected } from '@/lib/socket';

/**
 * useSocket: Manages socket connection lifecycle
 * 
 * Returns socket instance and connection state.
 * Automatically creates socket on mount and cleans up on unmount.
 */
export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    try {
      const socketInstance = getSocket();
      setSocket(socketInstance);
      setIsConnected(socketInstance.connected);

      // Listen for connection events
      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);

      socketInstance.on('connect', handleConnect);
      socketInstance.on('disconnect', handleDisconnect);

      return () => {
        socketInstance.off('connect', handleConnect);
        socketInstance.off('disconnect', handleDisconnect);
      };
    } catch (error) {
      console.error('Failed to create socket:', error);
      setSocket(null);
      setIsConnected(false);
    }
  }, []);

  return socket;
}

/**
 * useSocketEvent: Listen for a specific Socket.IO event
 * 
 * @param event - Event name to listen for
 * @param handler - Callback function when event fires
 * @param deps - Dependencies array (defaults to [event])
 */
export function useSocketEvent(
  event: string,
  handler: (...args: any[]) => void,
  deps: any[] = []
) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [socket, event, handler, ...deps]);
}

/**
 * useSocketEmit: Emit a Socket.IO event with optional callback
 * 
 * @param socket - Socket instance
 * @returns Function to emit event
 */
export function useSocketEmit(socket: Socket | null) {
  return useCallback(
    <T = any,>(
      event: string,
      data: any,
      callback?: (err: any, result?: T) => void
    ): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!socket) {
          reject(new Error('Socket not connected'));
          return;
        }

        if (callback) {
          socket.emit(event, data, (err: any, result?: T) => {
            if (err) {
              callback(err, undefined);
              reject(err);
            } else {
              callback(null, result);
              resolve(result as T);
            }
          });
        } else {
          socket.emit(event, data);
          resolve(undefined as T);
        }
      });
    },
    [socket]
  );
}
