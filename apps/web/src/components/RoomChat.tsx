'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import { useRoomChat, ChatMessage } from '@/hooks/useRoomChat';
import Avatar from '@/components/Avatar';

interface RoomChatProps {
  roomId: string;
  currentUserId: string;
  onError?: (error: string) => void;
}

/**
 * RoomChat: Real-time chat component for auction rooms
 * 
 * Features:
 * - Message list with user avatars, names, timestamps
 * - Input field with character counter (max 500)
 * - Send button (disabled during send)
 * - Show moderator-held indicator on messages in moderation
 * - Toast notification on rate-limit error
 * - Scroll to latest message on new message
 * - Mobile-responsive: 300px min width, 100% on mobile
 * - Respects prefers-reduced-motion
 */
export default function RoomChat({
  roomId,
  currentUserId,
  onError,
}: RoomChatProps) {
  const { messages, sendMessage, isLoading, error, rateLimitResetTime } =
    useRoomChat(roomId);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Auto-scroll to latest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  }, [messages, prefersReducedMotion]);

  // Show error in callback if provided
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    try {
      await sendMessage(input);
      setInput('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isRateLimited = rateLimitResetTime !== null && Date.now() < rateLimitResetTime;
  const charCount = input.length;
  const charLimit = 500;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-semibold text-text">Room Chat</h3>
        <p className="text-xs text-text-muted">Real-time messages</p>
      </div>

      {/* Messages Container */}
      <div
        id={`chat-messages-${roomId}`}
        className="flex-1 overflow-y-auto space-y-3 px-4 py-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-text-muted">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageItem key={msg.messageId} message={msg} isYou={msg.from === currentUserId} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Toast */}
      {error && (
        <div className="border-t border-border bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Rate Limit Indicator */}
      {isRateLimited && (
        <div className="border-t border-border bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          Please wait before sending another message...
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border bg-surface-raised px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            disabled={isLoading || isRateLimited}
            className="flex-1 resize-none rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder-text-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent"
            rows={2}
            maxLength={charLimit}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading || isRateLimited}
            className={`rounded bg-accent px-3 py-2 text-white transition-opacity duration-200 disabled:opacity-50 hover:enabled:opacity-90 ${
              prefersReducedMotion ? '' : 'transform hover:enabled:scale-105'
            }`}
            title="Send message (Enter)"
          >
            <Send size={20} />
          </button>
        </div>

        {/* Character Counter */}
        <div className="flex justify-between text-xs text-text-muted">
          <span></span>
          <span
            className={charCount > charLimit * 0.9 ? 'text-warning' : ''}
          >
            {charCount}/{charLimit}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual chat message item component
 */
function ChatMessageItem({
  message,
  isYou,
}: {
  message: ChatMessage;
  isYou: boolean;
}) {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <div
      className={`flex gap-2 ${
        prefersReducedMotion ? '' : 'animate-fadeIn'
      }`}
    >
      <Avatar userId={message.from} size="sm" />
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-text">
            {isYou ? 'You' : `User ${message.from.slice(0, 8)}`}
          </span>
          {message.authorRole && (
            <span className="text-xs rounded-full bg-accent/20 px-2 py-0.5 text-accent">
              {message.authorRole === 'HOST' ? 'Host' : message.authorRole === 'TEAM_OWNER' ? 'Owner' : 'Spectator'}
            </span>
          )}
          <span className="text-xs text-text-muted">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="mt-1 text-sm text-text break-words">{message.message}</p>
        {message.isModerationHeld && (
          <p className="mt-1 text-xs text-warning">
            ⚠ This message is under moderation review
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Format timestamp for display
 */
function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 1 minute
  if (diff < 60000) {
    return 'now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }

  // Less than 1 day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  // Show time
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * useMediaQuery: Check if media query matches
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
}
