/**
 * usePresence Hook Test
 * 
 * Tests presence list updates, participant tracking, and active bidder updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePresence } from './usePresence';

// Mock useSocket hook
vi.mock('./useSocket', () => ({
  useSocket: vi.fn(),
}));

import { useSocket } from './useSocket';

describe('usePresence', () => {
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

  describe('Presence List Updates', () => {
    it('should request presence snapshot on mount', async () => {
      const roomId = 'test-room-123';

      renderHook(() => usePresence(roomId));

      await waitFor(() => {
        const presenceCall = mockSocket.emit.mock.calls.find(
          (call: any[]) => call[0] === 'room:request-presence'
        );
        expect(presenceCall).toBeDefined();
        expect(presenceCall[1]).toMatchObject({
          roomId: 'test-room-123',
        });
      });
    });

    it('should populate presence list from server response', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'Host User',
            role: 'HOST',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
          {
            userId: 'user-2',
            userName: 'Team Owner',
            role: 'TEAM_OWNER',
            teamId: 'team-123',
            teamName: 'Team Alpha',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
        activeBidderId: 'user-2',
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        expect(result.current.participants.length).toBe(2);
        expect(result.current.participants[0].role).toBe('HOST');
        expect(result.current.participants[1].role).toBe('TEAM_OWNER');
        expect(result.current.activeBidderId).toBe('user-2');
      });
    });

    it('should track participant by role', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'host-1',
            userName: 'Host',
            role: 'HOST',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
          {
            userId: 'spectator-1',
            userName: 'Spectator',
            role: 'SPECTATOR',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        const hostParticipant = result.current.participants.find((p) => p.role === 'HOST');
        const spectatorParticipant = result.current.participants.find((p) => p.role === 'SPECTATOR');

        expect(hostParticipant?.userName).toBe('Host');
        expect(spectatorParticipant?.userName).toBe('Spectator');
      });
    });

    it('should include team information for team owners', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'Team Owner',
            role: 'TEAM_OWNER',
            teamId: 'team-123',
            teamName: 'Team Alpha',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        const teamOwner = result.current.participants[0];
        expect(teamOwner.teamId).toBe('team-123');
        expect(teamOwner.teamName).toBe('Team Alpha');
      });
    });
  });

  describe('Participant Tracking', () => {
    it('should track participant connection state', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        const participant = result.current.participants[0];
        expect(participant.connectionState).toBe('connected');
        expect(participant.isOnline).toBe(true);
      });
    });

    it('should update participant connection state on updates', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        expect(result.current.participants[0].isOnline).toBe(true);
      });

      // Simulate participant disconnection
      await act(() => {
        mockSocket._emit('room:presence:update', {
          userId: 'user-1',
          status: 'disconnected',
        });
      });

      await waitFor(() => {
        const participant = result.current.participants.find((p) => p.userId === 'user-1');
        expect(participant?.connectionState).toBe('disconnected');
        expect(participant?.isOnline).toBe(false);
      });
    });

    it('should handle reconnecting state', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        expect(result.current.participants[0].isOnline).toBe(true);
      });

      // Simulate reconnecting
      await act(() => {
        mockSocket._emit('room:presence:update', {
          userId: 'user-1',
          status: 'reconnecting',
        });
      });

      await waitFor(() => {
        const participant = result.current.participants.find((p) => p.userId === 'user-1');
        expect(participant?.connectionState).toBe('reconnecting');
      });
    });
  });

  describe('Active Bidder Updates', () => {
    it('should track active bidder', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
        activeBidderId: 'user-1',
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        expect(result.current.activeBidderId).toBe('user-1');
      });
    });

    it('should clear active bidder when no one is bidding', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceDataWithBidder = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
        activeBidderId: 'user-1',
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceDataWithBidder);
      });

      await waitFor(() => {
        expect(result.current.activeBidderId).toBe('user-1');
      });

      // Update without active bidder
      const presenceDataNoBidder = {
        roomId,
        participants: presenceDataWithBidder.participants,
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceDataNoBidder);
      });

      await waitFor(() => {
        expect(result.current.activeBidderId).toBeUndefined();
      });
    });
  });

  describe('Reconnection Handling', () => {
    it('should refetch presence on socket reconnect', async () => {
      let reconnectHandler: any;

      mockSocket.on.mockImplementation((event: string, handler: any) => {
        if (event === 'connect') {
          reconnectHandler = handler;
        }
        if (!mockSocket._handlers[event]) mockSocket._handlers[event] = [];
        mockSocket._handlers[event].push(handler);
      });

      const roomId = 'test-room-123';

      renderHook(() => usePresence(roomId));

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:request-presence', expect.any(Object));
      });

      mockSocket.emit.mockClear();

      // Simulate reconnect
      act(() => {
        if (reconnectHandler) reconnectHandler();
      });

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('room:request-presence', expect.any(Object));
      });
    });

    it('should update local connection state on disconnect', async () => {
      let disconnectHandler: any;

      mockSocket.on.mockImplementation((event: string, handler: any) => {
        if (event === 'disconnect') {
          disconnectHandler = handler;
        }
        if (!mockSocket._handlers[event]) mockSocket._handlers[event] = [];
        mockSocket._handlers[event].push(handler);
      });

      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'you-user-id',
            userName: 'You',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
            isYou: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        expect(result.current.participants[0].isOnline).toBe(true);
      });

      // Simulate disconnect
      act(() => {
        if (disconnectHandler) disconnectHandler();
      });

      await waitFor(() => {
        const youParticipant = result.current.participants.find((p) => p.isYou);
        if (youParticipant) {
          expect(youParticipant.isOnline).toBe(false);
          expect(youParticipant.connectionState).toBe('disconnected');
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle presence error response', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      await act(() => {
        mockSocket._emit('room:presence:error', {
          message: 'Presence fetch failed',
        });
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });

    it('should not crash on invalid presence data', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      expect(() => {
        act(() => {
          mockSocket._emit('room:presence', null);
        });
      }).not.toThrow();

      expect(() => {
        act(() => {
          mockSocket._emit('room:presence', {});
        });
      }).not.toThrow();
    });

    it('should handle malformed updates gracefully', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      expect(() => {
        act(() => {
          mockSocket._emit('room:presence:update', null);
        });
      }).not.toThrow();

      expect(() => {
        act(() => {
          mockSocket._emit('room:presence:update', { userId: 'user-1' }); // Missing status
        });
      }).not.toThrow();
    });
  });

  describe('Loading & Initial State', () => {
    it('should start in loading state', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.participants.length).toBe(0);
    });

    it('should exit loading state when presence is received', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      expect(result.current.isLoading).toBe(true);

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'TEAM_OWNER',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('Type Safety', () => {
    it('should maintain correct participant interface', async () => {
      const roomId = 'test-room-123';

      const { result } = renderHook(() => usePresence(roomId));

      const presenceData = {
        roomId,
        participants: [
          {
            userId: 'user-1',
            userName: 'User 1',
            role: 'HOST',
            connectedAt: new Date().toISOString(),
            isOnline: true,
          },
        ],
      };

      await act(() => {
        mockSocket._emit('room:presence', presenceData);
      });

      await waitFor(() => {
        const participant = result.current.participants[0];

        // Verify required fields
        expect(participant).toHaveProperty('userId');
        expect(participant).toHaveProperty('userName');
        expect(participant).toHaveProperty('role');
        expect(participant).toHaveProperty('joinedAt');
        expect(participant).toHaveProperty('connectionState');
        expect(participant).toHaveProperty('isOnline');

        // Verify type constraints
        expect(['HOST', 'TEAM_OWNER', 'SPECTATOR']).toContain(participant.role);
        expect(['connected', 'reconnecting', 'disconnected']).toContain(participant.connectionState);
        expect(typeof participant.isOnline).toBe('boolean');
      });
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from events on unmount', async () => {
      const roomId = 'test-room-123';

      const { unmount } = renderHook(() => usePresence(roomId));

      unmount();

      // After unmount, should not update on new events
      await act(() => {
        mockSocket._emit('room:presence', {
          roomId,
          participants: [
            {
              userId: 'new-user',
              userName: 'New User',
              role: 'SPECTATOR',
              connectedAt: new Date().toISOString(),
              isOnline: true,
            },
          ],
        });
      });

      // Should have called off to unsubscribe
      expect(mockSocket.off).toHaveBeenCalled();
    });
  });
});
