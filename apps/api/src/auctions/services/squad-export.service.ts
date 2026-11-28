import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { ExportFormat } from '@uth/contracts';

export interface ExportDataRow {
  teamName: string;
  teamColor: string;
  teamOwners: string;
  playerName: string;
  playerRole: string;
  playerCategory: string;
  acquisitionPriceMinor: string;
  purseBalanceMinor: string;
  complianceStatus: string;
}

@Injectable()
export class SquadExportService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyExportAuthorization(auctionId: string, userId: string): Promise<void> {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { id: true, hostId: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (auction.hostId === userId) {
      return;
    }

    const isTeamOwner = await this.prisma.teamOwner.findFirst({
      where: {
        auctionId,
        userId,
        releasedAt: null,
      },
    });

    if (!isTeamOwner) {
      throw new ForbiddenException('Not authorized to export this auction');
    }
  }

  async getSquadExportData(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { id: true, name: true, room: { select: { name: true } } },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    const teams = await this.prisma.auctionTeam.findMany({
      where: { auctionId },
      include: {
        team: { select: { name: true, primaryColor: true } },
        acquisitions: {
          include: {
            auctionPlayer: {
              include: {
                player: { select: { name: true, role: true, category: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        owners: {
          where: { releasedAt: null },
          include: { user: { select: { id: true, username: true, email: true } } },
        },
        squadValidations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { violations: true },
        },
      },
    });

    const purseBalances = await this.prisma.teamPurseTransaction.groupBy({
      by: ['auctionTeamId'],
      where: { auctionTeamId: { in: teams.map((t) => t.id) } },
      _sum: { amountChangeMinor: true },
    });

    const purseMap = new Map(
      purseBalances.map((p) => [p.auctionTeamId, p._sum.amountChangeMinor || 0n])
    );

    return {
      auctionId: auction.id,
      auctionName: auction.name,
      roomName: auction.room.name,
      exportedAt: new Date().toISOString(),
      teams: teams.map((team) => ({
        auctionTeamId: team.id,
        teamName: team.team.name,
        teamColor: team.team.primaryColor || '#000000',
        owners: team.owners.map((owner) => ({
          userId: owner.userId,
          displayName: owner.user.username || owner.user.email || `User ${owner.userId}`,
        })),
        acquisitions: team.acquisitions.map((acq) => ({
          playerName: acq.auctionPlayer.player.name,
          playerRole: acq.auctionPlayer.player.role,
          playerCategory: acq.auctionPlayer.player.category,
          priceMinor: acq.priceMinor,
        })),
        purseBalanceMinor: purseMap.get(team.id) || 0n,
        complianceStatus: this.formatComplianceStatus(team.squadValidations[0]),
      })),
    };
  }

  async exportSquadCsv(auctionId: string, userId: string): Promise<string> {
    await this.verifyExportAuthorization(auctionId, userId);
    const data = await this.getSquadExportData(auctionId);

    const rows: ExportDataRow[] = [];

    for (const team of data.teams) {
      if (team.acquisitions.length === 0) {
        rows.push({
          teamName: team.teamName,
          teamColor: team.teamColor,
          teamOwners: team.owners.map((o) => o.displayName).join(', '),
          playerName: '(no players)',
          playerRole: '',
          playerCategory: '',
          acquisitionPriceMinor: '',
          purseBalanceMinor: team.purseBalanceMinor.toString(),
          complianceStatus: team.complianceStatus,
        });
      } else {
        for (const acq of team.acquisitions) {
          rows.push({
            teamName: team.teamName,
            teamColor: team.teamColor,
            teamOwners: team.owners.map((o) => o.displayName).join(', '),
            playerName: acq.playerName,
            playerRole: acq.playerRole,
            playerCategory: acq.playerCategory,
            acquisitionPriceMinor: acq.priceMinor.toString(),
            purseBalanceMinor: team.purseBalanceMinor.toString(),
            complianceStatus: team.complianceStatus,
          });
        }
      }
    }

    const csv = Papa.unparse(rows, {
      header: true,
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
    });

    return csv;
  }

  async exportSquadXlsx(auctionId: string, userId: string): Promise<Buffer> {
    await this.verifyExportAuthorization(auctionId, userId);
    const data = await this.getSquadExportData(auctionId);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Squad');

    const headers = [
      'Team Name',
      'Team Color',
      'Team Owners',
      'Player Name',
      'Player Role',
      'Player Category',
      'Acquisition Price (minor)',
      'Purse Balance (minor)',
      'Compliance Status',
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern' as any, pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    worksheet.views = [{ state: 'frozen' as any, ySplit: 1 }];

    for (const team of data.teams) {
      if (team.acquisitions.length === 0) {
        worksheet.addRow([
          team.teamName,
          team.teamColor,
          team.owners.map((o) => o.displayName).join(', '),
          '(no players)',
          '',
          '',
          '',
          team.purseBalanceMinor.toString(),
          team.complianceStatus,
        ]);
      } else {
        for (const acq of team.acquisitions) {
          worksheet.addRow([
            team.teamName,
            team.teamColor,
            team.owners.map((o) => o.displayName).join(', '),
            acq.playerName,
            acq.playerRole,
            acq.playerCategory,
            acq.priceMinor.toString(),
            team.purseBalanceMinor.toString(),
            team.complianceStatus,
          ]);
        }
      }
    }

    worksheet.columns = [
      { width: 20 },
      { width: 15 },
      { width: 25 },
      { width: 25 },
      { width: 15 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 30 },
    ];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          if (cell.columnNumber >= 7 && cell.columnNumber <= 8) {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });
      }
    });

    return (await workbook.xlsx.writeBuffer()) as Buffer;
  }

  private formatComplianceStatus(validation: any): string {
    if (!validation) {
      return 'Unknown';
    }

    if (validation.violations && validation.violations.length > 0) {
      const violationSummary = validation.violations
        .map((v: any) => `${v.ruleType}:${v.currentCount}`)
        .join(', ');
      return `Violations: ${violationSummary}`;
    }

    return 'Compliant';
  }

  generateFilename(auctionId: string, format: ExportFormat, auctionName?: string): string {
    const sanitized = this.sanitizeFilename(auctionName || 'export');
    const shortId = auctionId.substring(0, 8);
    const timestamp = new Date().toISOString().split('T')[0];
    const ext = format === ExportFormat.CSV ? 'csv' : 'xlsx';
    return `squad_export_${shortId}_${sanitized}_${timestamp}.${ext}`;
  }

  private sanitizeFilename(input: string): string {
    let sanitized = input.replace(/[^\w\s\-.]/g, '_');
    sanitized = sanitized.replace(/[\s_]+/g, '_').trim().replace(/^_|_$/g, '');
    if (!sanitized) {
      sanitized = 'export';
    }
    return sanitized.substring(0, 200);
  }
}
