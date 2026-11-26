import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PresenceGateway } from '../presence.gateway';

describe('PresenceGateway (Unit Tests)', () => {
  let gateway: PresenceGateway;
  let jwtService: JwtService;

  beforeEach(async () => {
    const mockJwtService = {
      verify: jest.fn((token: string) => {
        if (token === 'valid-token') {
          return { sub: 'user-123' };
        }
        throw new Error('Invalid token');
      }),
    };

    const mockPresenceService = {};
    const mockRoomsRepo = {};
    const setPresenceGatewaySpy = jest.fn();
    const mockBroadcaster = {
      setPresenceGateway: setPresenceGatewaySpy,
    };

    // Create gateway instance - will call setPresenceGateway during constructor
    gateway = new PresenceGateway(
      mockJwtService as any,
      mockPresenceService as any,
      mockRoomsRepo as any,
      mockBroadcaster as any
    );

    // Verify setPresenceGateway was called
    expect(setPresenceGatewaySpy).toHaveBeenCalled();

    jwtService = mockJwtService as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('Socket Authentication', () => {
    it('should disconnect clients without token', () => {
      const mockSocket = {
        handshake: { auth: { token: null } },
        disconnect: jest.fn(),
        data: {},
      } as any;

      gateway.handleConnection(mockSocket);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should accept valid token', () => {
      const mockSocket = {
        handshake: { auth: { token: 'valid-token' } },
        disconnect: jest.fn(),
        data: {},
      } as any;

      gateway.handleConnection(mockSocket);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data.userId).toBe('user-123');
    });
  });

  describe('Presence Broadcasting', () => {
    beforeEach(() => {
      gateway.server = {
        to: jest.fn().mockReturnValue({
          emit: jest.fn(),
        }),
      } as any;
    });

    it('should broadcast presence to room-scoped channel', () => {
      const mockRoom = gateway.server.to('room:test-room') as any;

      gateway.broadcastPresence('test-room', {
        participants: [
          {
            userId: 'user-1',
            role: 'HOST',
            isOnline: true,
          },
        ],
      });

      expect(gateway.server.to).toHaveBeenCalledWith('room:test-room');
      expect(mockRoom.emit).toHaveBeenCalledWith('room:presence', expect.any(Object));
    });
  });
});
