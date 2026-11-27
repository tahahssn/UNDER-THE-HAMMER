import { Test, TestingModule } from '@nestjs/testing';
import { SquadExportService, ExportDataRow } from '../services/squad-export.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExportFormat } from '@uth/contracts';
import Papa from 'papaparse';

describe('SquadExportService', () => {
  let service: SquadExportService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    auction: {
      findUnique: jest.fn(),
    },
    teamOwner: {
      findFirst: jest.fn(),
    },
    auctionTeam: {
      findMany: jest.fn(),
    },
    teamPurseTransaction: {
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SquadExportService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SquadExportService>(SquadExportService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyExportAuthorization', () => {
    it('should allow host to export', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
      });

      await expect(service.verifyExportAuthorization('auction-1', 'user-1')).resolves.toBeUndefined();
    });

    it('should allow active team owner to export', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-host',
      });

      mockPrismaService.teamOwner.findFirst.mockResolvedValue({
        userId: 'user-owner',
        auctionId: 'auction-1',
        releasedAt: null,
      });

      await expect(service.verifyExportAuthorization('auction-1', 'user-owner')).resolves.toBeUndefined();
    });

    it('should reject non-host, non-team-owner', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-host',
      });

      mockPrismaService.teamOwner.findFirst.mockResolvedValue(null);

      await expect(service.verifyExportAuthorization('auction-1', 'user-stranger')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should reject released team owner', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-host',
      });

      mockPrismaService.teamOwner.findFirst.mockResolvedValue(null); // releasedAt IS NOT NULL, so findFirst returns null

      await expect(service.verifyExportAuthorization('auction-1', 'user-released')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw NotFoundException for missing auction', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue(null);

      await expect(service.verifyExportAuthorization('auction-missing', 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getSquadExportData', () => {
    it('should fetch and structure auction squad data', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Team A', primaryColor: '#FF0000' },
          acquisitions: [
            {
              auctionPlayer: {
                player: { name: 'Player A', role: 'Batter', category: 'International' },
              },
              priceMinor: 100000000n,
              createdAt: new Date(),
            },
          ],
          owners: [
            {
              userId: 'owner-1',
              user: { id: 'owner-1', username: 'Owner Name', email: 'owner@example.com' },
              releasedAt: null,
            },
          ],
          squadValidations: [
            {
              violations: [],
            },
          ],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([
        {
          auctionTeamId: 'team-1',
          _sum: { amountChangeMinor: 500000000n },
        },
      ]);

      const result = await service.getSquadExportData('auction-1');

      expect(result.auctionId).toBe('auction-1');
      expect(result.auctionName).toBe('PSL 2026');
      expect(result.roomName).toBe('Room A');
      expect(result.teams).toHaveLength(1);
      expect(result.teams[0].teamName).toBe('Team A');
      expect(result.teams[0].acquisitions).toHaveLength(1);
      expect(result.teams[0].acquisitions[0].priceMinor).toEqual(100000000n);
      expect(result.teams[0].purseBalanceMinor).toEqual(500000000n);
    });

    it('should throw NotFoundException for missing auction', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue(null);

      await expect(service.getSquadExportData('auction-missing')).rejects.toThrow(NotFoundException);
    });

    it('should handle empty purse balances', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Team A', primaryColor: '#FF0000' },
          acquisitions: [],
          owners: [],
          squadValidations: [],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([]);

      const result = await service.getSquadExportData('auction-1');

      expect(result.teams[0].purseBalanceMinor).toEqual(0n);
    });
  });

  describe('exportSquadCsv', () => {
    it('should generate valid CSV with headers', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Karachi Kings', primaryColor: '#3498db' },
          acquisitions: [
            {
              auctionPlayer: {
                player: { name: 'Player Name', role: 'Batter', category: 'Domestic' },
              },
              priceMinor: 50000000n,
              createdAt: new Date(),
            },
          ],
          owners: [
            {
              userId: 'owner-1',
              user: { id: 'owner-1', username: 'Owner1', email: null },
              releasedAt: null,
            },
          ],
          squadValidations: [
            {
              violations: [],
            },
          ],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([
        {
          auctionTeamId: 'team-1',
          _sum: { amountChangeMinor: 200000000n },
        },
      ]);

      const csv = await service.exportSquadCsv('auction-1', 'user-1');

      expect(csv).toContain('teamName');
      expect(csv).toContain('Player Name');
      expect(csv).toContain('50000000');
      expect(csv).toContain('200000000');

      // Verify CSV is parseable
      const parsed = Papa.parse(csv, { header: true });
      expect(parsed.data).toHaveLength(1);
    });

    it('should include placeholder row for empty teams', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Team Empty', primaryColor: '#000000' },
          acquisitions: [],
          owners: [],
          squadValidations: [],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([
        {
          auctionTeamId: 'team-1',
          _sum: { amountChangeMinor: 300000000n },
        },
      ]);

      const csv = await service.exportSquadCsv('auction-1', 'user-1');

      expect(csv).toContain('(no players)');
      expect(csv).toContain('300000000');
    });

    it('should properly escape special characters', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Team "Special", Chars', primaryColor: '#000000' },
          acquisitions: [
            {
              auctionPlayer: {
                player: { name: 'Player "Name", Test', role: 'Batter', category: 'Domestic' },
              },
              priceMinor: 50000000n,
              createdAt: new Date(),
            },
          ],
          owners: [],
          squadValidations: [],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([]);

      const csv = await service.exportSquadCsv('auction-1', 'user-1');

      // Special characters should be properly escaped in CSV
      expect(csv).toContain('Player \\"Name\\"');
    });

    it('should throw ForbiddenException for unauthorized user', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-host',
      });

      mockPrismaService.teamOwner.findFirst.mockResolvedValue(null);

      await expect(service.exportSquadCsv('auction-1', 'user-stranger')).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('exportSquadXlsx', () => {
    it('should generate valid XLSX buffer', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Team A', primaryColor: '#FF0000' },
          acquisitions: [
            {
              auctionPlayer: {
                player: { name: 'Player A', role: 'Batter', category: 'Domestic' },
              },
              priceMinor: 100000000n,
              createdAt: new Date(),
            },
          ],
          owners: [
            {
              userId: 'owner-1',
              user: { id: 'owner-1', username: 'Owner1', email: null },
              releasedAt: null,
            },
          ],
          squadValidations: [],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([
        {
          auctionTeamId: 'team-1',
          _sum: { amountChangeMinor: 500000000n },
        },
      ]);

      const buffer = await service.exportSquadXlsx('auction-1', 'user-1');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      // XLSX files start with PK (zip signature)
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    });

    it('should throw ForbiddenException for unauthorized user', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-host',
      });

      mockPrismaService.teamOwner.findFirst.mockResolvedValue(null);

      await expect(service.exportSquadXlsx('auction-1', 'user-stranger')).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('generateFilename', () => {
    it('should generate filename for CSV', () => {
      const filename = service.generateFilename('auction-123456789', ExportFormat.CSV, 'My Auction');

      expect(filename).toMatch(/^squad_export_auction1_My_Auction_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should generate filename for XLSX', () => {
      const filename = service.generateFilename('auction-987654321', ExportFormat.XLSX, 'Test Auction');

      expect(filename).toMatch(/^squad_export_auction9_Test_Auction_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it('should sanitize special characters in filename', () => {
      const filename = service.generateFilename('auction-abc12345', ExportFormat.CSV, 'Team @#$% 2026!');

      expect(filename).toContain('squad_export_');
      expect(filename).not.toContain('@');
      expect(filename).not.toContain('#');
      expect(filename).not.toContain('$');
      expect(filename).not.toContain('%');
      expect(filename).not.toContain('!');
    });

    it('should use fallback for empty sanitized name', () => {
      const filename = service.generateFilename('auction-abc12345', ExportFormat.CSV, '@#$%');

      expect(filename).toContain('export');
    });
  });

  describe('formatComplianceStatus', () => {
    it('should return Compliant for valid squad', () => {
      const validation = {
        violations: [],
      };

      const status = (service as any).formatComplianceStatus(validation);

      expect(status).toBe('Compliant');
    });

    it('should return violations summary', () => {
      const validation = {
        violations: [
          { ruleType: 'BATTER_LIMIT', currentCount: 2, requiredMin: 3 },
          { ruleType: 'BOWLER_LIMIT', currentCount: 1, requiredMin: 2 },
        ],
      };

      const status = (service as any).formatComplianceStatus(validation);

      expect(status).toContain('BATTER_LIMIT:2');
      expect(status).toContain('BOWLER_LIMIT:1');
    });

    it('should return Unknown for no validation', () => {
      const status = (service as any).formatComplianceStatus(null);

      expect(status).toBe('Unknown');
    });
  });

  describe('Edge cases', () => {
    it('should handle no teams', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([]);

      const result = await service.getSquadExportData('auction-1');

      expect(result.teams).toHaveLength(0);
    });

    it('should handle one team one player', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Team A', primaryColor: '#FF0000' },
          acquisitions: [
            {
              auctionPlayer: {
                player: { name: 'Player A', role: 'Batter', category: 'Domestic' },
              },
              priceMinor: 10000000n,
              createdAt: new Date(),
            },
          ],
          owners: [],
          squadValidations: [],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([]);

      const result = await service.getSquadExportData('auction-1');

      expect(result.teams).toHaveLength(1);
      expect(result.teams[0].acquisitions).toHaveLength(1);
    });

    it('should handle empty squads with multiple teams', async () => {
      mockPrismaService.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        hostId: 'user-1',
        name: 'PSL 2026',
        room: { name: 'Room A' },
      });

      mockPrismaService.auctionTeam.findMany.mockResolvedValue([
        {
          id: 'team-1',
          team: { name: 'Team A', primaryColor: '#FF0000' },
          acquisitions: [],
          owners: [],
          squadValidations: [],
        },
        {
          id: 'team-2',
          team: { name: 'Team B', primaryColor: '#00FF00' },
          acquisitions: [],
          owners: [],
          squadValidations: [],
        },
      ]);

      mockPrismaService.teamPurseTransaction.groupBy.mockResolvedValue([]);

      const result = await service.getSquadExportData('auction-1');

      expect(result.teams).toHaveLength(2);
      expect(result.teams[0].acquisitions).toHaveLength(0);
      expect(result.teams[1].acquisitions).toHaveLength(0);
    });
  });
});
