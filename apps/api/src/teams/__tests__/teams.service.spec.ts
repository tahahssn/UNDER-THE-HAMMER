import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from '../teams.service';
import { TeamRepository } from '../repositories/team.repository';

describe('TeamsService', () => {
  let service: TeamsService;
  let repository: TeamRepository;

  const mockTeam = {
    id: 'team-1',
    createdById: 'user-1',
    name: 'Karachi Kings',
    shortName: 'KK',
    description: 'A cricket team',
    primaryColor: '#FF5733',
    secondaryColor: '#33FF57',
    countryCode: 'PK',
    status: 'ACTIVE',
    currentLogoAssetId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: {
      id: 'user-1',
      email: 'user@example.com',
      profile: { displayName: 'User One' },
    },
    currentLogo: null,
    members: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: TeamRepository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            archive: jest.fn(),
            isMember: jest.fn(),
            isMemberWithRole: jest.fn(),
            setCurrentLogo: jest.fn(),
            findByCreator: jest.fn(),
            findAll: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    repository = module.get<TeamRepository>(TeamRepository);
  });

  describe('createTeam', () => {
    it('should create a team with valid input', async () => {
      const input = {
        name: 'Karachi Kings',
        shortName: 'KK',
        description: 'A cricket team',
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
        countryCode: 'PK',
      };

      (repository.create as jest.Mock).mockResolvedValue(mockTeam);

      const result = await service.createTeam(input, 'user-1');

      expect(result.name).toBe('Karachi Kings');
      expect(result.createdBy.displayName).toBe('User One');
    });

    it('should throw BadRequestException if name is empty', async () => {
      const input = {
        name: '',
        shortName: 'KK',
        primaryColor: '#FF5733',
      };

      await expect(service.createTeam(input as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if name exceeds 100 characters', async () => {
      const input = {
        name: 'a'.repeat(101),
        shortName: 'KK',
        primaryColor: '#FF5733',
      };

      await expect(service.createTeam(input as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if shortName exceeds 20 characters', async () => {
      const input = {
        name: 'Karachi Kings',
        shortName: 'a'.repeat(21),
        primaryColor: '#FF5733',
      };

      await expect(service.createTeam(input as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if primaryColor is not valid hex', async () => {
      const input = {
        name: 'Karachi Kings',
        shortName: 'KK',
        primaryColor: 'invalid',
      };

      await expect(service.createTeam(input as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if secondaryColor is not valid hex', async () => {
      const input = {
        name: 'Karachi Kings',
        shortName: 'KK',
        primaryColor: '#FF5733',
        secondaryColor: 'invalid',
      };

      await expect(service.createTeam(input as any, 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTeam', () => {
    it('should allow owner to update team', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);
      (repository.update as jest.Mock).mockResolvedValue({ ...mockTeam, name: 'Updated Name' });

      const result = await service.updateTeam('team-1', { name: 'Updated Name' }, 'user-1');

      expect(result.name).toBe('Updated Name');
      expect(repository.update).toHaveBeenCalled();
    });

    it('should allow MANAGER member to update team', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);
      (repository.isMemberWithRole as jest.Mock).mockResolvedValue(true);
      (repository.update as jest.Mock).mockResolvedValue({ ...mockTeam, name: 'Updated Name' });

      const result = await service.updateTeam('team-1', { name: 'Updated Name' }, 'user-2');

      expect(result.name).toBe('Updated Name');
      expect(repository.isMemberWithRole).toHaveBeenCalledWith('team-1', 'user-2', 'MANAGER');
    });

    it('should deny non-owner non-manager from updating team', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);
      (repository.isMemberWithRole as jest.Mock).mockResolvedValue(false);

      await expect(service.updateTeam('team-1', { name: 'Updated Name' }, 'user-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if team does not exist', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.updateTeam('invalid-id', { name: 'Updated Name' }, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should validate hex colors on update', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);

      await expect(
        service.updateTeam('team-1', { primaryColor: 'invalid' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('archiveTeam', () => {
    it('should allow owner to archive team', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);
      (repository.archive as jest.Mock).mockResolvedValue({ ...mockTeam, status: 'ARCHIVED' });

      await service.archiveTeam('team-1', 'user-1');

      expect(repository.archive).toHaveBeenCalledWith('team-1');
    });

    it('should deny non-owner from archiving team', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);

      await expect(service.archiveTeam('team-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if team does not exist', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.archiveTeam('invalid-id', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setCurrentLogo', () => {
    it('should allow owner to set current logo', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);
      (repository.setCurrentLogo as jest.Mock).mockResolvedValue({ ...mockTeam, currentLogoAssetId: 'asset-1' });

      await service.setCurrentLogo('team-1', 'asset-1', 'user-1');

      expect(repository.setCurrentLogo).toHaveBeenCalledWith('team-1', 'asset-1');
    });

    it('should deny non-owner from setting logo', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(mockTeam);

      await expect(service.setCurrentLogo('team-1', 'asset-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if team does not exist', async () => {
      (repository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.setCurrentLogo('team-1', 'asset-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
