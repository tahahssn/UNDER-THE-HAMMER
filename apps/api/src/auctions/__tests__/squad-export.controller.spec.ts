import { Test, TestingModule } from '@nestjs/testing';
import { AuctionsController } from '../auctions.controller';
import { SquadExportService } from '../services/squad-export.service';
import { AuctionsService } from '../auctions.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExportFormat } from '@uth/contracts';

describe('AuctionsController - Export Endpoint', () => {
  let controller: AuctionsController;
  let exportService: SquadExportService;
  let auctionsService: AuctionsService;

  const mockExportService = {
    exportSquadCsv: jest.fn(),
    exportSquadXlsx: jest.fn(),
    generateFilename: jest.fn(),
  };

  const mockAuctionsService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuctionsController],
      providers: [
        {
          provide: SquadExportService,
          useValue: mockExportService,
        },
        {
          provide: AuctionsService,
          useValue: mockAuctionsService,
        },
      ],
    }).compile();

    controller = module.get<AuctionsController>(AuctionsController);
    exportService = module.get<SquadExportService>(SquadExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /v1/auctions/:auctionId/export', () => {
    let mockRes: any;

    beforeEach(() => {
      mockRes = {
        setHeader: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('should return 400 if format param is missing', async () => {
      await expect(
        controller.exportSquad('auction-1', undefined, 'user-1', mockRes)
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 for invalid format', async () => {
      await expect(
        controller.exportSquad('auction-1', 'invalid', 'user-1', mockRes)
      ).rejects.toThrow(BadRequestException);
    });

    it('should export CSV when format=csv', async () => {
      mockExportService.exportSquadCsv.mockResolvedValue('team,player\nTeamA,Player1');
      mockExportService.generateFilename.mockReturnValue('squad_export_abc12345_Test_2026-01-15.csv');

      await controller.exportSquad('auction-1', 'csv', 'user-1', mockRes);

      expect(mockExportService.exportSquadCsv).toHaveBeenCalledWith('auction-1', 'user-1');
      expect(mockExportService.generateFilename).toHaveBeenCalledWith('auction-1', ExportFormat.CSV);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename=')
      );
      expect(mockRes.send).toHaveBeenCalledWith('team,player\nTeamA,Player1');
    });

    it('should export XLSX when format=xlsx', async () => {
      const mockBuffer = Buffer.from([0x50, 0x4b]); // PK header for XLSX
      mockExportService.exportSquadXlsx.mockResolvedValue(mockBuffer);
      mockExportService.generateFilename.mockReturnValue('squad_export_abc12345_Test_2026-01-15.xlsx');

      await controller.exportSquad('auction-1', 'xlsx', 'user-1', mockRes);

      expect(mockExportService.exportSquadXlsx).toHaveBeenCalledWith('auction-1', 'user-1');
      expect(mockExportService.generateFilename).toHaveBeenCalledWith('auction-1', ExportFormat.XLSX);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
    });

    it('should handle case-insensitive format param', async () => {
      mockExportService.exportSquadCsv.mockResolvedValue('team,player\nTeamA,Player1');
      mockExportService.generateFilename.mockReturnValue('squad_export_abc12345_Test_2026-01-15.csv');

      await controller.exportSquad('auction-1', 'CSV', 'user-1', mockRes);

      expect(mockExportService.exportSquadCsv).toHaveBeenCalled();
    });

    it('should return 403 for unauthorized user (CSV)', async () => {
      mockExportService.exportSquadCsv.mockRejectedValue(
        new ForbiddenException('Not authorized to export this auction')
      );

      await expect(
        controller.exportSquad('auction-1', 'csv', 'user-stranger', mockRes)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return 403 for unauthorized user (XLSX)', async () => {
      mockExportService.exportSquadXlsx.mockRejectedValue(
        new ForbiddenException('Not authorized to export this auction')
      );

      await expect(
        controller.exportSquad('auction-1', 'xlsx', 'user-stranger', mockRes)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return 404 for missing auction (CSV)', async () => {
      mockExportService.exportSquadCsv.mockRejectedValue(new NotFoundException('Auction not found'));

      await expect(
        controller.exportSquad('auction-missing', 'csv', 'user-1', mockRes)
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 404 for missing auction (XLSX)', async () => {
      mockExportService.exportSquadXlsx.mockRejectedValue(new NotFoundException('Auction not found'));

      await expect(
        controller.exportSquad('auction-missing', 'xlsx', 'user-1', mockRes)
      ).rejects.toThrow(NotFoundException);
    });

    it('should set correct CSV headers', async () => {
      mockExportService.exportSquadCsv.mockResolvedValue('csv-data');
      mockExportService.generateFilename.mockReturnValue('export_2026-01-15.csv');

      await controller.exportSquad('auction-1', 'csv', 'user-1', mockRes);

      const headerCalls = mockRes.setHeader.mock.calls;
      expect(headerCalls).toContainEqual(['Content-Type', 'text/csv; charset=utf-8']);
      expect(headerCalls.some((call: any) => call[0] === 'Content-Disposition' && call[1].includes('csv'))).toBe(true);
    });

    it('should set correct XLSX headers', async () => {
      const mockBuffer = Buffer.from([0x50, 0x4b]);
      mockExportService.exportSquadXlsx.mockResolvedValue(mockBuffer);
      mockExportService.generateFilename.mockReturnValue('export_2026-01-15.xlsx');

      await controller.exportSquad('auction-1', 'xlsx', 'user-1', mockRes);

      const headerCalls = mockRes.setHeader.mock.calls;
      expect(
        headerCalls.some((call: any) =>
          call[0] === 'Content-Type' &&
          call[1] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      ).toBe(true);
      expect(headerCalls.some((call: any) => call[0] === 'Content-Disposition' && call[1].includes('xlsx'))).toBe(true);
    });

    it('should set Content-Disposition filename correctly', async () => {
      mockExportService.exportSquadCsv.mockResolvedValue('csv-data');
      mockExportService.generateFilename.mockReturnValue('squad_export_abc_PSL_2026-01-15.csv');

      await controller.exportSquad('auction-1', 'csv', 'user-1', mockRes);

      const dispositionCall = mockRes.setHeader.mock.calls.find(
        (call: any) => call[0] === 'Content-Disposition'
      );
      expect(dispositionCall[1]).toContain('attachment');
      expect(dispositionCall[1]).toContain('squad_export_abc_PSL_2026-01-15.csv');
    });

    it('should handle internal errors during CSV generation', async () => {
      mockExportService.exportSquadCsv.mockRejectedValue(new Error('Database error'));

      await expect(
        controller.exportSquad('auction-1', 'csv', 'user-1', mockRes)
      ).rejects.toThrow();
    });

    it('should handle internal errors during XLSX generation', async () => {
      mockExportService.exportSquadXlsx.mockRejectedValue(new Error('Buffer generation error'));

      await expect(
        controller.exportSquad('auction-1', 'xlsx', 'user-1', mockRes)
      ).rejects.toThrow();
    });

    it('should not call exportSquad if format validation fails', async () => {
      await expect(
        controller.exportSquad('auction-1', 'pdf', 'user-1', mockRes)
      ).rejects.toThrow(BadRequestException);

      expect(mockExportService.exportSquadCsv).not.toHaveBeenCalled();
      expect(mockExportService.exportSquadXlsx).not.toHaveBeenCalled();
    });
  });
});
