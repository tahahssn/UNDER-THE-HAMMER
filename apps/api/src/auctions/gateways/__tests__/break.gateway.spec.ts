import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BreakGateway } from '../break.gateway';

describe('BreakGateway (Unit Tests)', () => {
  let gateway: BreakGateway;
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

    const mockAuctionsRepo = {};
    const mockRoomsRepo = {};
    const mockBreakManager = {};
    const setBreakGatewaySpy = jest.fn();
    const mockBroadcaster = {
      setBreakGateway: setBreakGatewaySpy,
    };

    gateway = new BreakGateway(
      mockJwtService as any,
      mockAuctionsRepo as any,
      mockRoomsRepo as any,
      mockBreakManager as any,
      mockBroadcaster as any
    );

    // Verify setBreakGateway was called
    expect(setBreakGatewaySpy).toHaveBeenCalled();

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

    it('should disconnect clients with invalid token', () => {
      const mockSocket = {
        handshake: { auth: { token: 'invalid-token' } },
        disconnect: jest.fn(),
        data: {},
      } as any;

      gateway.handleConnection(mockSocket);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should accept valid JWT token', () => {
      const mockSocket = {
        handshake: { auth: { token: 'valid-token' } },
        disconnect: jest.fn(),
        data: {},
      } as any;

      gateway.handleConnection(mockSocket);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data.userId).toBe('user-123');
    });

    it('should reject empty sub claim', () => {
      (jwtService.verify as any).mockReturnValue({ sub: '' });

      const mockSocket = {
        handshake: { auth: { token: 'token-with-empty-sub' } },
        disconnect: jest.fn(),
        data: {},
      } as any;

      gateway.handleConnection(mockSocket);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Break Event Broadcasting', () => {
    beforeEach(() => {
      gateway.server = {
        to: jest.fn().mockReturnValue({
          emit: jest.fn(),
        }),
      } as any;
    });

    it('should broadcast break:started event', () => {
      const mockRoom = gateway.server.to('auction:test-123') as any;

      gateway.broadcastBreakStarted('room-123', 'test-123', {
        breakId: 'break-1',
        durationSeconds: 120,
      });

      expect(gateway.server.to).toHaveBeenCalledWith('auction:test-123');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'break:started',
        expect.objectContaining({ auctionId: 'test-123', breakId: 'break-1' })
      );
    });

    it('should include timestamp in broadcast', () => {
      const mockRoom = gateway.server.to('auction:test-123') as any;

      gateway.broadcastBreakStarted('room-123', 'test-123', {
        breakId: 'break-1',
        durationSeconds: 120,
      });

      const call = mockRoom.emit.mock.calls[0][1];
      expect(call).toHaveProperty('timestamp');
      expect(call.timestamp instanceof Date).toBe(true);
    });

    it('should broadcast break:updated event', () => {
      const mockRoom = gateway.server.to('auction:test-123') as any;

      gateway.broadcastBreakUpdated('room-123', 'test-123', {
        breakId: 'break-1',
        adjustmentSeconds: 60,
      });

      expect(mockRoom.emit).toHaveBeenCalledWith('break:updated', expect.any(Object));
    });

    it('should broadcast break:ended event', () => {
      const mockRoom = gateway.server.to('auction:test-123') as any;

      gateway.broadcastBreakEnded('room-123', 'test-123', {
        breakId: 'break-1',
        endedAt: new Date(),
      });

      expect(mockRoom.emit).toHaveBeenCalledWith('break:ended', expect.any(Object));
    });
  });
});
