import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SquadsService } from '../services/squads.service';
import { AuctionsRepository } from '../auctions.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('SquadsService', () => {
  let service: SquadsService;
  let mockRepository: jest.Mocked<AuctionsRepository>;
  let mockPrisma: jest.Mocked<PrismaService>;

  const mockAuctionId = 'auction-123';
  const mockAuctionTeamId = 'team-123';
  const mockValidationId = 'validation-123';

  beforeEach(async () => {
    mockRepository = {
      getAuctionTeamById: jest.fn(),
      getAcquisitionsByAuctionTeam: jest.fn(),
      recordSquadValidation: jest.fn(),
      recordSquadViolation: jest.fn(),
      getLatestSquadValidation: jest.fn(),
      getSquadViolations: jest.fn(),
    } as any;

    mockPrisma = {
      squadRule: {
        findMany: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SquadsService,
        {
          provide: AuctionsRepository,
          useValue: mockRepository,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<SquadsService>(SquadsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSquadProgress', () => {
    it('should calculate SQUAD_SIZE progress', async () => {
      const mockTeam = { id: mockAuctionTeamId, teamId: 'team-1' };
      const mockAcquisitions = Array(16).fill(null).map((_, i) => ({
        id: `acq-${i}`,
        playerId: `player-${i}`,
        player: { id: `player-${i}`, role: 'BATTER' },
      }));

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'SQUAD_SIZE',
          minCount: 15,
          maxCount: 18,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      const progress = await service.getSquadProgress(mockAuctionId, mockAuctionTeamId);

      expect(progress).toHaveLength(1);
      expect(progress[0]).toMatchObject({
        type: 'SQUAD_SIZE',
        currentCount: 16,
        minCount: 15,
        maxCount: 18,
        satisfied: true,
      });
    });

    it('should calculate ROLE_COUNT progress', async () => {
      const mockTeam = { id: mockAuctionTeamId, teamId: 'team-1' };
      const mockAcquisitions = [
        { id: 'acq-1', player: { id: 'p-1', role: 'BATTER' } },
        { id: 'acq-2', player: { id: 'p-2', role: 'BATTER' } },
        { id: 'acq-3', player: { id: 'p-3', role: 'BATTER' } },
        { id: 'acq-4', player: { id: 'p-4', role: 'BOWLER' } },
        { id: 'acq-5', player: { id: 'p-5', role: 'BOWLER' } },
        { id: 'acq-6', player: { id: 'p-6', role: 'WICKETKEEPER' } },
      ];

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'ROLE_COUNT',
          role: 'BATTER',
          minCount: 2,
          maxCount: 5,
          categoryId: null,
          category: null,
        },
        {
          id: 'rule-2',
          type: 'ROLE_COUNT',
          role: 'BOWLER',
          minCount: 2,
          maxCount: 5,
          categoryId: null,
          category: null,
        },
      ] as any);

      const progress = await service.getSquadProgress(mockAuctionId, mockAuctionTeamId);

      expect(progress).toHaveLength(2);
      expect(progress[0]).toMatchObject({
        type: 'ROLE_COUNT',
        currentCount: 3,
        satisfied: true,
      });
      expect(progress[1]).toMatchObject({
        type: 'ROLE_COUNT',
        currentCount: 2,
        satisfied: true,
      });
    });

    it('should calculate DOMESTIC_COUNT progress', async () => {
      const mockTeam = { id: mockAuctionTeamId, teamId: 'team-1' };
      const mockAcquisitions = [
        { id: 'acq-1', player: { id: 'p-1', countryCode: 'PK' } },
        { id: 'acq-2', player: { id: 'p-2', countryCode: 'PK' } },
        { id: 'acq-3', player: { id: 'p-3', countryCode: 'PK' } },
        { id: 'acq-4', player: { id: 'p-4', countryCode: 'AU' } },
        { id: 'acq-5', player: { id: 'p-5', countryCode: 'AU' } },
      ];

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'DOMESTIC_COUNT',
          minCount: 2,
          maxCount: 5,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      const progress = await service.getSquadProgress(mockAuctionId, mockAuctionTeamId);

      expect(progress[0]).toMatchObject({
        type: 'DOMESTIC_COUNT',
        currentCount: 3,
        satisfied: true,
      });
    });

    it('should calculate OVERSEAS_COUNT progress', async () => {
      const mockTeam = { id: mockAuctionTeamId, teamId: 'team-1' };
      const mockAcquisitions = [
        { id: 'acq-1', player: { id: 'p-1', countryCode: 'PK' } },
        { id: 'acq-2', player: { id: 'p-2', countryCode: 'AU' } },
        { id: 'acq-3', player: { id: 'p-3', countryCode: 'AU' } },
        { id: 'acq-4', player: { id: 'p-4', countryCode: 'NZ' } },
        { id: 'acq-5', player: { id: 'p-5', countryCode: 'NZ' } },
      ];

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'OVERSEAS_COUNT',
          minCount: 2,
          maxCount: 5,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      const progress = await service.getSquadProgress(mockAuctionId, mockAuctionTeamId);

      expect(progress[0]).toMatchObject({
        type: 'OVERSEAS_COUNT',
        currentCount: 4,
        satisfied: true,
      });
    });

    it('should mark progress unsatisfied when below minimum', async () => {
      const mockTeam = { id: mockAuctionTeamId, teamId: 'team-1' };
      const mockAcquisitions = [
        { id: 'acq-1', player: { id: 'p-1', role: 'BATTER' } },
      ];

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'SQUAD_SIZE',
          minCount: 15,
          maxCount: 18,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      const progress = await service.getSquadProgress(mockAuctionId, mockAuctionTeamId);

      expect(progress[0]).toMatchObject({
        satisfied: false,
      });
    });

    it('should throw error if team not found', async () => {
      mockRepository.getAuctionTeamById.mockResolvedValue(null);

      await expect(
        service.getSquadProgress(mockAuctionId, mockAuctionTeamId)
      ).rejects.toThrow('Auction team not found');
    });
  });

  describe('validateSquadRequirements', () => {
    it('should validate all requirements and return valid: true', async () => {
      const mockTeam = { id: mockAuctionTeamId };
      const mockAcquisitions = Array(16).fill(null).map((_, i) => ({
        id: `acq-${i}`,
        player: { id: `p-${i}`, role: 'BATTER', countryCode: 'PK' },
      }));

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'SQUAD_SIZE',
          minCount: 15,
          maxCount: 18,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      mockRepository.recordSquadValidation.mockResolvedValue({
        id: mockValidationId,
        auctionId: mockAuctionId,
        auctionTeamId: mockAuctionTeamId,
        valid: true,
      } as any);

      const result = await service.validateSquadRequirements(
        mockAuctionId,
        mockAuctionTeamId
      );

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(mockRepository.recordSquadValidation).toHaveBeenCalledWith(
        expect.objectContaining({
          auctionId: mockAuctionId,
          auctionTeamId: mockAuctionTeamId,
          valid: true,
        })
      );
    });

    it('should detect BELOW_MIN violations', async () => {
      const mockTeam = { id: mockAuctionTeamId };
      const mockAcquisitions = [
        { id: 'acq-1', player: { id: 'p-1', role: 'BATTER' } },
      ];

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'SQUAD_SIZE',
          minCount: 15,
          maxCount: 18,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      mockRepository.recordSquadValidation.mockResolvedValue({
        id: mockValidationId,
      } as any);

      const result = await service.validateSquadRequirements(
        mockAuctionId,
        mockAuctionTeamId
      );

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatchObject({
        violationType: 'BELOW_MIN',
        currentCount: 1,
        requiredMinCount: 15,
      });

      expect(mockRepository.recordSquadViolation).toHaveBeenCalled();
    });

    it('should record all violations in audit trail', async () => {
      const mockTeam = { id: mockAuctionTeamId };
      const mockAcquisitions = [
        { id: 'acq-1', player: { id: 'p-1', role: 'BATTER', countryCode: 'AU' } },
      ];

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'SQUAD_SIZE',
          minCount: 15,
          maxCount: 18,
          role: null,
          categoryId: null,
          category: null,
        },
        {
          id: 'rule-2',
          type: 'DOMESTIC_COUNT',
          minCount: 10,
          maxCount: 15,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      mockRepository.recordSquadValidation.mockResolvedValue({
        id: mockValidationId,
      } as any);

      await service.validateSquadRequirements(mockAuctionId, mockAuctionTeamId);

      expect(mockRepository.recordSquadViolation).toHaveBeenCalledTimes(2);
    });

    it('should not block bid acceptance (violations are audit trail only)', async () => {
      const mockTeam = { id: mockAuctionTeamId };
      const mockAcquisitions: any[] = [];

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'SQUAD_SIZE',
          minCount: 15,
          maxCount: 18,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      mockRepository.recordSquadValidation.mockResolvedValue({
        id: mockValidationId,
      } as any);

      const result = await service.validateSquadRequirements(
        mockAuctionId,
        mockAuctionTeamId
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('updateProgressOnAcquisition', () => {
    it('should recalculate progress after player acquisition', async () => {
      const mockTeam = { id: mockAuctionTeamId };
      const mockAcquisitions = Array(5).fill(null).map((_, i) => ({
        id: `acq-${i}`,
        player: { id: `p-${i}` },
      }));

      mockRepository.getAuctionTeamById.mockResolvedValue(mockTeam);
      mockRepository.getAcquisitionsByAuctionTeam.mockResolvedValue(
        mockAcquisitions as any
      );

      mockPrisma.squadRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          type: 'SQUAD_SIZE',
          minCount: 15,
          maxCount: 18,
          role: null,
          categoryId: null,
          category: null,
        },
      ] as any);

      const result = await service.updateProgressOnAcquisition(
        mockAuctionId,
        mockAuctionTeamId
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        currentCount: 5,
        satisfied: false,
      });
    });
  });

  describe('getLatestValidation', () => {
    it('should retrieve latest validation record', async () => {
      const mockValidation = {
        id: mockValidationId,
        auctionId: mockAuctionId,
        auctionTeamId: mockAuctionTeamId,
        valid: true,
        createdAt: new Date(),
        violations: [],
      };

      mockRepository.getLatestSquadValidation.mockResolvedValue(
        mockValidation as any
      );

      const result = await service.getLatestValidation(
        mockAuctionId,
        mockAuctionTeamId
      );

      expect(result).toEqual(mockValidation);
      expect(mockRepository.getLatestSquadValidation).toHaveBeenCalledWith(
        mockAuctionId,
        mockAuctionTeamId
      );
    });
  });

  describe('getViolations', () => {
    it('should retrieve all violations for team (audit trail)', async () => {
      const mockViolations = [
        {
          id: 'v-1',
          auctionTeamId: mockAuctionTeamId,
          violationType: 'BELOW_MIN',
          currentCount: 1,
          requiredMinCount: 15,
          createdAt: new Date(),
        },
        {
          id: 'v-2',
          auctionTeamId: mockAuctionTeamId,
          violationType: 'BELOW_MIN',
          currentCount: 2,
          requiredMinCount: 15,
          createdAt: new Date(),
        },
      ];

      mockRepository.getSquadViolations.mockResolvedValue(
        mockViolations as any
      );

      const result = await service.getViolations(mockAuctionTeamId);

      expect(result).toHaveLength(2);
      expect(result).toEqual(mockViolations);
      expect(mockRepository.getSquadViolations).toHaveBeenCalledWith(
        mockAuctionTeamId
      );
    });
  });
});
