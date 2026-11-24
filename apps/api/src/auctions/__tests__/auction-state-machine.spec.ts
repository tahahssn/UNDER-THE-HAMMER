import { Test, TestingModule } from '@nestjs/testing';
import { AuctionStateMachineService } from '../services/auction-state-machine.service';
import { AuctionsRepository } from '../auctions.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuctionStateMachineService', () => {
  let service: AuctionStateMachineService;
  let repository: AuctionsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionStateMachineService,
        {
          provide: AuctionsRepository,
          useValue: {
            getAuctionById: jest.fn(),
            updateAuctionPhase: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuctionStateMachineService>(AuctionStateMachineService);
    repository = module.get<AuctionsRepository>(AuctionsRepository);
  });

  describe('isValidTransition', () => {
    it('should allow DRAFT -> REGISTRATION', () => {
      expect(service.isValidTransition('DRAFT', 'REGISTRATION')).toBe(true);
    });

    it('should allow REGISTRATION -> READY', () => {
      expect(service.isValidTransition('REGISTRATION', 'READY')).toBe(true);
    });

    it('should allow READY -> LIVE', () => {
      expect(service.isValidTransition('READY', 'LIVE')).toBe(true);
    });

    it('should allow LIVE -> SETTLEMENT', () => {
      expect(service.isValidTransition('LIVE', 'SETTLEMENT')).toBe(true);
    });

    it('should allow SETTLEMENT -> CONCLUDED', () => {
      expect(service.isValidTransition('SETTLEMENT', 'CONCLUDED')).toBe(true);
    });

    it('should not allow CONCLUDED -> DRAFT', () => {
      expect(service.isValidTransition('CONCLUDED', 'DRAFT')).toBe(false);
    });

    it('should not allow DRAFT -> LIVE (skipping steps)', () => {
      expect(service.isValidTransition('DRAFT', 'LIVE')).toBe(false);
    });
  });

  describe('isConfigurationLocked', () => {
    it('should lock configuration when LIVE', () => {
      expect(service.isConfigurationLocked('LIVE')).toBe(true);
    });

    it('should lock configuration when SETTLEMENT', () => {
      expect(service.isConfigurationLocked('SETTLEMENT')).toBe(true);
    });

    it('should lock configuration when CONCLUDED', () => {
      expect(service.isConfigurationLocked('CONCLUDED')).toBe(true);
    });

    it('should not lock configuration when DRAFT', () => {
      expect(service.isConfigurationLocked('DRAFT')).toBe(false);
    });

    it('should not lock configuration when REGISTRATION', () => {
      expect(service.isConfigurationLocked('REGISTRATION')).toBe(false);
    });
  });
});
