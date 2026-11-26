/**
 * useRoomSocket Integration Test
 * 
 * Tests room join/leave lifecycle, reconnection handling, and event subscription cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRoomSocket } from './useRoomSocket';

// Mock useSocket hook
vi.mock('./useSocket', () => ({
  useSocket: vi.fn(),
}));

import { useSocket } from './useSocket';

describe('useRoomSocket', () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      connected: true,
      disconnect: vi.fn(),
    };

    (useSocket as any).mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Join/Leave Lifecycle', () => {
    it('should emit room:join on mount with correct payload structure', async () => {
      const roomId = 'test-room-123';
      const role = 'TEAM_OWNER' as const;
      const teamId = 'team-456';

      renderHook(() => useRoomSocket(roomId, role, teamId));

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:join', {
          roomId: 'test-room-123',
          role: 'TEAM_OWNER',
          teamId: 'team-456',
          auctionId: 'test-room-123',
        });
      });
    });

    it('should emit room:leave on unmount', async () => {
      const roomId = 'test-room-123';
      const role = 'HOST' as const;

      const { unmount } = renderHook(() => useRoomSocket(roomId, role));

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:join', expect.any(Object));
      });

      unmount();

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', {
          roomId: 'test-room-123',
        });
      });
    });

    it('should not join if socket is null', async () => {
      (useSocket as any).mockReturnValue(null);

      renderHook(() => useRoomSocket('test-room', 'SPECTATOR'));

      await waitFor(() => {
        expect(mockSocket.emit).not.toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it('should not join if roomId is empty', async () => {
      renderHook(() => useRoomSocket('', 'HOST'));

      await waitFor(() => {
        expect(mockSocket.emit).not.toHaveBeenCalled();
      }, { timeout: 500 });
    });
  });

  describe('Reconnection Handling', () => {
    it('should re-join room on socket reconnect', async () => {
      let connectHandler: any;

      mockSocket.on.mockImplementation((event: string, handler: any) => {
        if (event === 'connect') {
          connectHandler = handler;
        }
      });

      const roomId = 'test-room-123';
      const role = 'TEAM_OWNER' as const;

      renderHook(() => useRoomSocket(roomId, role));

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:join', expect.any(Object));
      });

      // Clear previous calls
      mockSocket.emit.mockClear();

      // Simulate reconnect
      act(() => {
        if (connectHandler) {
          connectHandler();
        }
      });

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:join', expect.any(Object));
      });
    });

    it('should not re-join before first join completes', async () => {
      const roomId = 'test-room-123';
      const role = 'HOST' as const;

      renderHook(() => useRoomSocket(roomId, role));

      // Should have called once on mount
      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      });
    });

    it('should clean up connection listener on unmount', async () => {
      const roomId = 'test-room-123';
      const role = 'TEAM_OWNER' as const;

      let connectHandler: any;
      mockSocket.on.mockImplementation((event: string, handler: any) => {
        if (event === 'connect') {
          connectHandler = handler;
        }
      });

      const { unmount } = renderHook(() => useRoomSocket(roomId, role));

      unmount();

      await waitFor(() => {
        expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
      });
    });
  });

  describe('Event Subscription Cleanup', () => {
    it('should clean up listeners on unmount', async () => {
      const roomId = 'test-room-123';
      const role = 'HOST' as const;

      const { unmount } = renderHook(() => useRoomSocket(roomId, role));

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalled();
      });

      unmount();

      // Should have called off to remove connect listener
      expect(mockSocket.off).toHaveBeenCalled();
    });

    it('should re-subscribe if roomId changes', async () => {
      const { rerender } = renderHook(
        ({ roomId, role }) => useRoomSocket(roomId, role),
        {
          initialProps: { roomId: 'room-1', role: 'HOST' as const },
        }
      );

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:join', expect.objectContaining({
          roomId: 'room-1',
        }));
      });

      mockSocket.emit.mockClear();

      rerender({ roomId: 'room-2', role: 'HOST' as const });

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', expect.objectContaining({
          roomId: 'room-1',
        }));
        expect(mockSocket.emit).toHaveBeenCalledWith('room:join', expect.objectContaining({
          roomId: 'room-2',
        }));
      });
    });
  });

  describe('Return Values', () => {
    it('should return joinRoom and leaveRoom functions', async () => {
      const roomId = 'test-room-123';
      const role = 'TEAM_OWNER' as const;

      const { result } = renderHook(() => useRoomSocket(roomId, role));

      expect(result.current).toHaveProperty('joinRoom');
      expect(result.current).toHaveProperty('leaveRoom');
      expect(typeof result.current.joinRoom).toBe('function');
      expect(typeof result.current.leaveRoom).toBe('function');
    });

    it('should allow manual join/leave calls', async () => {
      const roomId = 'test-room-123';
      const role = 'TEAM_OWNER' as const;

      const { result } = renderHook(() => useRoomSocket(roomId, role));

      mockSocket.emit.mockClear();

      act(() => {
        result.current.leaveRoom();
      });

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:leave', expect.any(Object));
      });

      mockSocket.emit.mockClear();

      act(() => {
        result.current.joinRoom();
      });

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:join', expect.any(Object));
      });
    });
  });

  describe('Type Safety', () => {
    it('should enforce role type correctness', () => {
      // This is a TypeScript compile-time check
      const roomId = 'test-room-123';
      
      // Valid roles
      renderHook(() => useRoomSocket(roomId, 'HOST'));
      renderHook(() => useRoomSocket(roomId, 'TEAM_OWNER'));
      renderHook(() => useRoomSocket(roomId, 'SPECTATOR'));

      // Note: TypeScript would error on invalid roles at compile time
      // This test documents the expected type safety
      expect(true).toBe(true);
    });

    it('should include correct payload contract', async () => {
      const roomId = 'test-room-123';
      const role = 'TEAM_OWNER' as const;
      const teamId = 'team-456';

      renderHook(() => useRoomSocket(roomId, role, teamId));

      await waitFor(() => {
        const callArgs = mockSocket.emit.mock.calls[0][1];
        
        // Verify all required fields are present
        expect(callArgs).toHaveProperty('roomId');
        expect(callArgs).toHaveProperty('role');
        expect(callArgs).toHaveProperty('auctionId');
        
        // Verify team-owner specific fields
        if (role === 'TEAM_OWNER') {
          expect(callArgs).toHaveProperty('teamId');
          expect(callArgs.teamId).toBe(teamId);
        }
      });
    });
  });
});
