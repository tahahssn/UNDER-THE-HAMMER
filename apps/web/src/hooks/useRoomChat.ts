'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import {
  ChatMessagePayload,
  ChatSendRequest,
  ChatErrorPayload,
  ChatHistoryPayload,
  isChatMessagePayload,
  ChatHistoryRequest,
} from '@/lib/socket-events';

export interface ChatMessage {
  messageId: string;
  from: string;
  message: string;
  timestamp: Date;
  isModerationHeld?: boolean;
  authorRole?: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  idempotencyKey?: string; // Track for deduplication
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
 * - Listens to chat:message events from server (type-safe)
 * - Validates message length before sending
 * - Idempotency keys prevent duplicate messages on reconnect
 * - Replaces optimistic pending message with server version
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

  // Track sent idempotency keys to handle server echoes and prevent duplicates
  const sentKeysRef = useRef<Map<string, string>>(new Map());

  // Listen for incoming messages
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleChatMessage = (payload: unknown) => {
      // Type-safe validation
      if (!isChatMessagePayload(payload)) {
        console.error('Invalid chat message payload:', payload);
        return;
      }

      const chatPayload = payload as ChatMessagePayload;
      const message: ChatMessage = {
        messageId: chatPayload.messageId,
        from: chatPayload.from,
        message: chatPayload.message,
        timestamp: new Date(chatPayload.timestamp),
        isModerationHeld: chatPayload.isModerationHeld,
        authorRole: chatPayload.authorRole,
      };

      setMessages((prev) => {
        // Check if this is a server echo of our pending message by idempotency key
        let pendingMessageId: string | null = null;
        for (const [pendingId, idempotencyKey] of sentKeysRef.current.entries()) {
          if (idempotencyKey === message.idempotencyKey) {
            pendingMessageId = pendingId;
            break;
          }
        }

        if (pendingMessageId) {
          // Replace pending message with server version
          sentKeysRef.current.delete(pendingMessageId);
          return prev.map((m) => (m.messageId === pendingMessageId ? message : m));
        }

        // Check if we already have this message (idempotent delivery)
        if (prev.some((m) => m.messageId === message.messageId)) {
          return prev; // Already exists, don't duplicate
        }

        // New message from someone else
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

    const handleChatError = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        setError('Unknown chat error');
        setIsLoading(false);
        return;
      }

      const errorPayload = payload as ChatErrorPayload;

      if (errorPayload.code === 'RATE_LIMITED') {
        setError('You are sending messages too quickly. Please wait.');
        setRateLimitRemaining(0);
        setRateLimitResetTime(Date.now() + RATE_LIMIT_COOLDOWN);

        // Reset after cooldown
        setTimeout(() => {
          setRateLimitResetTime(null);
          setError(null);
          setRateLimitRemaining(10);
        }, RATE_LIMIT_COOLDOWN);
      } else if (errorPayload.code === 'USER_MUTED') {
        setError('You have been muted in this room.');
      } else {
        setError(errorPayload.message || 'Failed to send message');
      }
      setIsLoading(false);
    };

    socket.on('chat:message', handleChatMessage);
    socket.on('chat:send:error', handleChatError);

    // Request message history on mount
    const historyRequest: ChatHistoryRequest = { roomId, limit: 50 };
    socket.emit('chat:request-history', historyRequest);

    const handleChatHistory = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const historyPayload = payload as ChatHistoryPayload;

      if (historyPayload.messages && Array.isArray(historyPayload.messages)) {
        const historyMessages: ChatMessage[] = historyPayload.messages.map((msg) => ({
          messageId: msg.messageId,
          from: msg.from,
          message: msg.message,
          timestamp: new Date(msg.timestamp),
          isModerationHeld: msg.isModerationHeld,
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

      // Create unique idempotency key for this message
      // Format: timestamp-nonce (server will validate this for deduplication)
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const pendingMessageId = `pending-${idempotencyKey}`;

      // Add optimistic message
      const optimisticMessage: ChatMessage = {
        messageId: pendingMessageId,
        from: 'you', // Will be replaced by server response
        message: trimmed,
        timestamp: new Date(),
        idempotencyKey,
      };

      // Track pending message: pendingId -> idempotencyKey
      // When server echoes back with idempotencyKey, we match by that key
      sentKeysRef.current.set(pendingMessageId, idempotencyKey);

      setMessages((prev) => [...prev, optimisticMessage]);

      // Emit to server with idempotency key for server-side deduplication
      const sendRequest: ChatSendRequest = {
        roomId,
        message: trimmed,
        idempotencyKey,
      };
      socket.emit('chat:send', sendRequest);

      // Note: Server response will trigger handleChatMessage which matches by idempotencyKey
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
