/**
 * useRoomChat Hook Test
 * 
 * Tests message sending, rate-limit handling, and optimistic UI updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRoomChat } from './useRoomChat';

// Mock useSocket hook
vi.mock('./useSocket', () => ({
  useSocket: vi.fn(),
}));

import { useSocket } from './useSocket';

describe('useRoomChat', () => {
  let mockSocket: any;
  let mockOn: any;

  beforeEach(() => {
    const handlers: { [key: string]: any[] } = {};

    mockOn = (event: string, handler: any) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    };

    const mockOff = (event: string, handler: any) => {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h: any) => h !== handler);
      }
    };

    mockSocket = {
      emit: vi.fn(),
      on: mockOn,
      off: mockOff,
      connected: true,
      _handlers: handlers,
      _emit: (event: string, data: any) => {
        if (handlers[event]) {
          handlers[event].forEach((handler: any) => handler(data));
        }
      },
    };

    (useSocket as any).mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Message Sending', () => {
    it('should send message with valid input', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(async () => {
        await result.current.sendMessage('Hello, room!');
      });

      await waitFor(() => {
        const sendCall = mockSocket.emit.mock.calls.find((call: any[]) => call[0] === 'chat:send');
        expect(sendCall).toBeDefined();
        expect(sendCall[1]).toMatchObject({
          roomId: 'test-room-123',
          message: 'Hello, room!',
        });
      });
    });

    it('should include idempotency key in send request', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      await waitFor(() => {
        const sendCall = mockSocket.emit.mock.calls.find((call: any[]) => call[0] === 'chat:send');
        expect(sendCall[1]).toHaveProperty('idempotencyKey');
        expect(typeof sendCall[1].idempotencyKey).toBe('string');
        expect(sendCall[1].idempotencyKey.length).toBeGreaterThan(0);
      });
    });

    it('should not send empty messages', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(async () => {
        await result.current.sendMessage('   '); // Only whitespace
      });

      expect(result.current.error).toBeTruthy();
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'chat:send',
        expect.any(Object)
      );
    });

    it('should not send messages exceeding max length', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      const longMessage = 'a'.repeat(501); // Exceeds 500 char limit

      await act(async () => {
        await result.current.sendMessage(longMessage);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error).toContain('500');
    });

    it('should handle socket not connected', async () => {
      (useSocket as any).mockReturnValue(null);

      const { result } = renderHook(() => useRoomChat('test-room'));

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      expect(result.current.error).toBe('Socket not connected');
    });
  });

  describe('Optimistic UI', () => {
    it('should add optimistic message to list immediately', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      expect(result.current.messages.length).toBe(0);

      await act(async () => {
        await result.current.sendMessage('Optimistic message');
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0);
        expect(result.current.messages[0].message).toBe('Optimistic message');
      });
    });

    it('should mark optimistic message with pending ID', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(async () => {
        await result.current.sendMessage('Pending message');
      });

      await waitFor(() => {
        const optimisticMsg = result.current.messages.find(
          (m) => m.message === 'Pending message'
        );
        expect(optimisticMsg?.messageId).toContain('pending-');
      });
    });

    it('should replace optimistic message with server response', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      let idempotencyKey = '';

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      await waitFor(() => {
        const sendCall = mockSocket.emit.mock.calls.find((call: any[]) => call[0] === 'chat:send');
        idempotencyKey = sendCall[1].idempotencyKey;
      });

      // Simulate server response with same idempotency key
      await act(() => {
        mockSocket._emit('chat:message', {
          messageId: 'msg-server-123',
          from: 'user-123',
          message: 'Test message',
          timestamp: new Date().toISOString(),
          idempotencyKey,
        });
      });

      await waitFor(() => {
        // Should have replaced the pending message
        const serverMsg = result.current.messages.find(
          (m) => m.messageId === 'msg-server-123'
        );
        expect(serverMsg).toBeDefined();
        expect(serverMsg?.message).toBe('Test message');
      });
    });
  });

  describe('Rate Limit Handling', () => {
    it('should update rate limit info on rate limit error', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(() => {
        mockSocket._emit('chat:send:error', {
          code: 'RATE_LIMITED',
          message: 'Too many messages',
        });
      });

      await waitFor(() => {
        expect(result.current.error).toContain('too quickly');
        expect(result.current.rateLimitRemaining).toBe(0);
        expect(result.current.rateLimitResetTime).toBeTruthy();
      });
    });

    it('should clear rate limit error after cooldown', async () => {
      vi.useFakeTimers();

      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(() => {
        mockSocket._emit('chat:send:error', {
          code: 'RATE_LIMITED',
          message: 'Too many messages',
        });
      });

      expect(result.current.error).toBeTruthy();

      // Fast-forward past cooldown
      await act(async () => {
        vi.advanceTimersByTime(60100); // 60 second cooldown + 100ms
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.rateLimitRemaining).toBe(10);
      });

      vi.useRealTimers();
    });

    it('should handle USER_MUTED error', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(() => {
        mockSocket._emit('chat:send:error', {
          code: 'USER_MUTED',
          message: 'You have been muted',
        });
      });

      await waitFor(() => {
        expect(result.current.error).toContain('muted');
      });
    });
  });

  describe('Message History', () => {
    it('should request message history on mount', async () => {
      const roomId = 'test-room-123';

      renderHook(() => useRoomChat(roomId));

      await waitFor(() => {
        const historyCall = mockSocket.emit.mock.calls.find(
          (call: any[]) => call[0] === 'chat:request-history'
        );
        expect(historyCall).toBeDefined();
        expect(historyCall[1]).toMatchObject({
          roomId: 'test-room-123',
          limit: 50,
        });
      });
    });

    it('should populate messages from history', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      const historyMessages = [
        {
          messageId: 'msg-1',
          from: 'user-1',
          message: 'Previous message 1',
          timestamp: new Date().toISOString(),
        },
        {
          messageId: 'msg-2',
          from: 'user-2',
          message: 'Previous message 2',
          timestamp: new Date().toISOString(),
        },
      ];

      await act(() => {
        mockSocket._emit('chat:history', {
          roomId,
          messages: historyMessages,
        });
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBe(2);
        expect(result.current.messages[0].message).toBe('Previous message 1');
        expect(result.current.messages[1].message).toBe('Previous message 2');
      });
    });
  });

  describe('Message Broadcasting', () => {
    it('should add incoming messages from other users', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(() => {
        mockSocket._emit('chat:message', {
          messageId: 'msg-incoming',
          from: 'other-user',
          message: 'Hello from someone else',
          timestamp: new Date().toISOString(),
        });
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0);
        const incomingMsg = result.current.messages.find(
          (m) => m.from === 'other-user'
        );
        expect(incomingMsg).toBeDefined();
        expect(incomingMsg?.message).toBe('Hello from someone else');
      });
    });

    it('should not duplicate messages on idempotent delivery', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      const message = {
        messageId: 'msg-123',
        from: 'user-1',
        message: 'Test message',
        timestamp: new Date().toISOString(),
      };

      // Receive message twice
      await act(() => {
        mockSocket._emit('chat:message', message);
        mockSocket._emit('chat:message', message);
      });

      await waitFor(() => {
        const duplicates = result.current.messages.filter((m) => m.messageId === 'msg-123');
        expect(duplicates.length).toBe(1);
      });
    });

    it('should include moderation status for held messages', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      await act(() => {
        mockSocket._emit('chat:message', {
          messageId: 'msg-held',
          from: 'user-1',
          message: 'Held for moderation',
          timestamp: new Date().toISOString(),
          isModerationHeld: true,
          authorRole: 'TEAM_OWNER',
        });
      });

      await waitFor(() => {
        const heldMsg = result.current.messages.find((m) => m.messageId === 'msg-held');
        expect(heldMsg?.isModerationHeld).toBe(true);
        expect(heldMsg?.authorRole).toBe('TEAM_OWNER');
      });
    });
  });

  describe('Type Safety & Validation', () => {
    it('should validate incoming message payload structure', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      // Send invalid payload
      await act(() => {
        mockSocket._emit('chat:message', {
          invalidField: 'missing required fields',
        });
      });

      // Should not add invalid message (or should handle gracefully)
      // The hook should validate the payload
      expect(result.current.messages.length).toBe(0);
    });

    it('should not throw on malformed error responses', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => useRoomChat(roomId));

      expect(() => {
        mockSocket._emit('chat:send:error', null);
      }).not.toThrow();

      expect(() => {
        mockSocket._emit('chat:send:error', {});
      }).not.toThrow();
    });

    it('should handle missing socket gracefully', async () => {
      (useSocket as any).mockReturnValue(null);

      const { result } = renderHook(() => useRoomChat('test-room'));

      expect(result.current.messages).toBeDefined();
      expect(Array.isArray(result.current.messages)).toBe(true);
      expect(result.current.error).not.toBeUndefined();
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from events on unmount', async () => {
      const roomId = 'test-room-123';

      const { unmount } = renderHook(() => useRoomChat(roomId));

      unmount();

      // After unmount, should not receive new messages
      await act(() => {
        mockSocket._emit('chat:message', {
          messageId: 'msg-after-unmount',
          from: 'user-1',
          message: 'This should not be added',
          timestamp: new Date().toISOString(),
        });
      });

      // Listeners should have been removed
      expect(mockSocket.off).toHaveBeenCalled();
    });
  });
});
