/**
 * Socket.IO client singleton service
 * Handles connection, authentication, reconnection, and room management.
 * 
 * Features:
 * - JWT authentication via Bearer token from localStorage
 * - Exponential backoff reconnection (3 retries, max 5s)
 * - Automatic room join on connect
 * - Singleton pattern to ensure one connection per app
 */

import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './api';

const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  socketNamespace: '/auctions',
};

let socketInstance: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY = 1000; // 1 second

/**
 * Create and configure Socket.IO connection
 */
function createSocket(): Socket {
  const token = getAuthToken();

  if (!token) {
    throw new Error('No authentication token available');
  }

  const socket = io(`${API_CONFIG.baseUrl}${API_CONFIG.socketNamespace}`, {
    auth: {
      token: `Bearer ${token}`,
    },
    reconnection: true,
    reconnectionDelay: RECONNECT_BASE_DELAY,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    transports: ['websocket', 'polling'],
  });

  // Handle connection
  socket.on('connect', () => {
    reconnectAttempts = 0;
    console.log('[Socket] Connected:', socket.id);
  });

  // Handle reconnection attempts
  socket.on('reconnect_attempt', () => {
    reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1),
      5000
    );
    console.log(
      `[Socket] Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (delay: ${delay}ms)`
    );
  });

  // Handle connection error
  socket.on('connect_error', (error: any) => {
    console.error('[Socket] Connection error:', error.message);
  });

  // Handle disconnect
  socket.on('disconnect', (reason: string) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
}

/**
 * Get or create socket singleton
 */
export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = createSocket();
  }
  return socketInstance;
}

/**
 * Create a new socket (for testing or multi-connection scenarios)
 */
export function createNewSocket(): Socket {
  return createSocket();
}

/**
 * Disconnect socket and clean up
 */
export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    reconnectAttempts = 0;
  }
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socketInstance?.connected ?? false;
}

/**
 * Emit event with optional callback
 */
export function emitSocket<T = any>(
  event: string,
  data: any,
  callback?: (err: any, result?: T) => void
): void {
  const socket = getSocket();
  if (callback) {
    socket.emit(event, data, callback);
  } else {
    socket.emit(event, data);
  }
}

/**
 * Listen for event
 */
export function onSocket(event: string, handler: (...args: any[]) => void): void {
  const socket = getSocket();
  socket.on(event, handler);
}

/**
 * Stop listening for event
 */
export function offSocket(event: string, handler?: (...args: any[]) => void): void {
  const socket = getSocket();
  if (handler) {
    socket.off(event, handler);
  } else {
    socket.off(event);
  }
}
