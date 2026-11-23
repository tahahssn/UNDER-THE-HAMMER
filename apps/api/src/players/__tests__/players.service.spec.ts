import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlayersService } from '../players.service';
import { PlayerRepository } from '../repositories/player.repository';

describe('PlayersService', () => {
  let service: PlayersService;
  let repository: PlayerRepository;

  const mockPlayer = {
    id: '1',
    fullName: 'Babar Azam',
    displayName: 'Babar Azam',
    role: 'BATTER',
    battingStyle: 'RIGHT_HAND',
    bowlingStyle: null,
    dateOfBirth: new Date('1994-07-15'),
    countryCode: 'PK',
    categoryId: 'cat-1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    country: { code: 'PK', name: 'Pakistan' },
    category: { id: 'cat-1', key: 'MARQUEE', name: 'Marquee', sortOrder: 1 },
    aliases: [{ id: '1', playerId: '1', alias: 'Babar' }],
  };

  const mockStatistics = [
    {
      id: '1',
      playerId: '1',
      format: 'T20',
      matches: 50,
      runs: 1500,
      battingAverage: null,
      strikeRate: 140.5,
      wickets: null,
      bowlingAverage: null,
      bowlingEconomy: null,
      asOf: new Date(),
      providerId: 'prov-1',
      provider: { name: 'ICC', licenseNotes: null },
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayersService,
        {
          provide: PlayerRepository,
          useValue: {
            search: jest.fn(),
            findById: jest.fn(),
            getStatistics: jest.fn(),
            findByCategory: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlayersService>(PlayersService);
    repository = module.get<PlayerRepository>(PlayerRepository);
  });

  describe('searchPlayers', () => {
    it('should return paginated players with search criteria', async () => {
      const query = { search: 'Babar', skip: 0, take: 20 };
      (repository.search as jest.Mock).mockResolvedValue({
        items: [mockPlayer],
        total: 1,
      });

      const result = await service.searchPlayers(query, 0, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].displayName).toBe('Babar Azam');
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should indicate hasMore correctly', async () => {
      const query = { search: 'Babar', skip: 0, take: 20 };
      (repository.search as jest.Mock).mockResolvedValue({
        items: [mockPlayer],
        total: 50,
      });

      const result = await service.searchPlayers(query, 0, 20);

      expect(result.hasMore).toBe(true);
    });

    it('should include category and country information', async () => {
      const query = { skip: 0, take: 20 };
      (repository.search as jest.Mock).mockResolvedValue({
        items: [mockPlayer],
        total: 1,
      });

      const result = await service.searchPlayers(query, 0, 20);

      expect(result.items[0].category).toEqual({ id: 'cat-1', key: 'MARQUEE', name: 'Marquee', sortOrder: 1 });
      expect(result.items[0].country).toEqual({ code: 'PK', name: 'Pakistan' });
    });
  });

  describe('getPlayerDetail', () => {
    it('should return player detail with statistics grouped by format', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockPlayer);
      (repository.getStatistics as jest.Mock).mockResolvedValue(mockStatistics);

      const result = await service.getPlayerDetail('1');

      expect(result.id).toBe('1');
      expect(result.displayName).toBe('Babar Azam');
      expect(result.aliases).toEqual(['Babar']);
      expect(result.statistics).toHaveProperty('T20');
      expect(result.statistics.T20).toHaveLength(1);
      expect(result.statistics.T20[0].runs).toBe(1500);
    });

    it('should convert Map to Record for JSON serialization', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockPlayer);
      (repository.getStatistics as jest.Mock).mockResolvedValue(mockStatistics);

      const result = await service.getPlayerDetail('1');

      // Verify statistics is a plain object (Record), not a Map
      expect(result.statistics).toBeInstanceOf(Object);
      expect(result.statistics).not.toBeInstanceOf(Map);
      expect(Object.keys(result.statistics)).toContain('T20');
    });

    it('should include provider attribution', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockPlayer);
      (repository.getStatistics as jest.Mock).mockResolvedValue(mockStatistics);

      const result = await service.getPlayerDetail('1');

      expect(result.statistics.T20[0].provider).toEqual({ name: 'ICC', licenseNotes: undefined });
    });

    it('should throw NotFoundException if player does not exist', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.getPlayerDetail('invalid-id')).rejects.toThrow(NotFoundException);
    });

    it('should include multiple statistics by format', async () => {
      const multiFormatStats = [
        { ...mockStatistics[0], format: 'T20' },
        { ...mockStatistics[0], id: '2', format: 'ODI', runs: 2000 },
      ];

      (repository.findById as jest.Mock).mockResolvedValue(mockPlayer);
      (repository.getStatistics as jest.Mock).mockResolvedValue(multiFormatStats);

      const result = await service.getPlayerDetail('1');

      expect(Object.keys(result.statistics)).toContain('T20');
      expect(Object.keys(result.statistics)).toContain('ODI');
      expect(result.statistics.T20[0].runs).toBe(1500);
      expect(result.statistics.ODI[0].runs).toBe(2000);
    });
  });

  describe('getPlayersByCategory', () => {
    it('should return players filtered by category', async () => {
      (repository.findByCategory as jest.Mock).mockResolvedValue([mockPlayer]);

      const result = await service.getPlayersByCategory('cat-1', 0, 20);

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe('cat-1');
    });
  });
});
