import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from '../chat.gateway';

describe('ChatGateway (Unit Tests)', () => {
  let gateway: ChatGateway;
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

    const mockRoomsRepo = {};
    const mockChatService = {};
    const setChatGatewaySpy = jest.fn();
    const mockBroadcaster = {
      setChatGateway: setChatGatewaySpy,
    };

    gateway = new ChatGateway(
      mockJwtService as any,
      mockRoomsRepo as any,
      mockChatService as any,
      mockBroadcaster as any
    );

    // Verify setChatGateway was called
    expect(setChatGatewaySpy).toHaveBeenCalled();

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

  describe('Message Broadcasting', () => {
    beforeEach(() => {
      gateway.server = {
        to: jest.fn().mockReturnValue({
          emit: jest.fn(),
        }),
      } as any;
    });

    it('should broadcast messages to room-scoped channel', () => {
      const mockRoom = gateway.server.to('room:test-room') as any;

      gateway.broadcastChatMessage('test-room', {
        messageId: 'msg-1',
        from: 'user-1',
        message: 'Test message',
      });

      expect(gateway.server.to).toHaveBeenCalledWith('room:test-room');
      expect(mockRoom.emit).toHaveBeenCalledWith('chat:message', expect.any(Object));
    });
  });
});
