'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

export interface ChatMessage {
  messageId: string;
  from: string;
  message: string;
  timestamp: Date;
  isModerationHeld?: boolean;
  authorRole?: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
}

export interface RoomChatState {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  rateLimitRemaining: number;
  rateLimitResetTime: number | null;
}

const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_COOLDOWN = 60000; // 1 minute for rate limit feedback

/**
 * useRoomChat: Manages room chat messages and UI state
 * 
 * Features:
 * - Listens to chat:message events from server
 * - Validates message length before sending
 * - Optimistic UI: show pending message, replace with server version
 * - Rate-limit feedback: show cooldown timer if rate-limited
 * - Scroll to latest message on new message
 * 
 * @param roomId - Room ID
 * @returns Chat state and control functions
 */
export function useRoomChat(roomId: string): RoomChatState {
  const socket = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(10);
  const [rateLimitResetTime, setRateLimitResetTime] = useState<number | null>(null);

  // Listen for incoming messages
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleChatMessage = (payload: any) => {
      const message: ChatMessage = {
        messageId: payload.messageId,
        from: payload.from,
        message: payload.message,
        timestamp: new Date(payload.timestamp),
        isModerationHeld: payload.isModerationHeld || false,
        authorRole: payload.authorRole,
      };

      setMessages((prev) => {
        // Replace pending optimistic message with server version
        const hasPendingEntry = prev.some((m) => m.messageId.startsWith('pending-'));
        if (hasPendingEntry) {
          return prev.map((m) => (m.messageId.startsWith('pending-') ? message : m));
        }
        // If no pending entry, just append
        return [...prev, message];
      });

      // Scroll to latest message
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          const chatContainer = document.getElementById(`chat-messages-${roomId}`);
          if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        }, 0);
      }
    };

    const handleChatError = (payload: any) => {
      if (payload.code === 'RATE_LIMITED') {
        setError('You are sending messages too quickly. Please wait.');
        setRateLimitRemaining(0);
        setRateLimitResetTime(Date.now() + RATE_LIMIT_COOLDOWN);

        // Reset after cooldown
        setTimeout(() => {
          setRateLimitResetTime(null);
          setError(null);
          setRateLimitRemaining(10);
        }, RATE_LIMIT_COOLDOWN);
      } else if (payload.code === 'USER_MUTED') {
        setError('You have been muted in this room.');
      } else {
        setError(payload.message || 'Failed to send message');
      }
      setIsLoading(false);
    };

    socket.on(`chat:message`, handleChatMessage);
    socket.on(`chat:send:error`, handleChatError);

    // Request message history on mount
    socket.emit('chat:request-history', { roomId, limit: 50 });

    const handleChatHistory = (payload: any) => {
      if (payload.messages) {
        const historyMessages: ChatMessage[] = payload.messages.map((msg: any) => ({
          messageId: msg.messageId,
          from: msg.from,
          message: msg.message,
          timestamp: new Date(msg.timestamp),
          isModerationHeld: msg.isModerationHeld || false,
        }));
        setMessages(historyMessages);
      }
    };

    socket.on('chat:history', handleChatHistory);

    return () => {
      socket.off('chat:message', handleChatMessage);
      socket.off('chat:send:error', handleChatError);
      socket.off('chat:history', handleChatHistory);
    };
  }, [socket, roomId]);

  // Send message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!socket || !roomId) {
        setError('Socket not connected');
        return;
      }

      const trimmed = text.trim();

      // Validation
      if (!trimmed) {
        setError('Message cannot be empty');
        return;
      }

      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        setError(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
        return;
      }

      setIsLoading(true);
      setError(null);

      // Add optimistic message
      const optimisticMessage: ChatMessage = {
        messageId: `pending-${Date.now()}`,
        from: 'you', // Will be replaced by server response
        message: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // Emit to server
      socket.emit('chat:send', {
        roomId,
        message: trimmed,
      });

      // Note: Server response will trigger handleChatMessage which will replace optimistic message
      setIsLoading(false);
    },
    [socket, roomId]
  );

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    rateLimitRemaining,
    rateLimitResetTime,
  };
}
