import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// @ts-ignore - papaparse doesn't have TypeScript types
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { ExportFormat, SquadExportResponse, ComplianceStatusDetail } from '@uth/contracts';

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
  private readonly logger = new Logger(SquadExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify user is authorized to export this auction (host or active team owner).
   * Also returns authorized auctionTeamId if user is owner (for filtering).
   * Throws ForbiddenException if not authorized.
   */
  async verifyExportAuthorization(
    auctionId: string,
    userId: string
  ): Promise<{ isHost: boolean; authorizedTeamId?: string }> {
    // Check if room exists and get its host
    const room = await this.prisma.auctionRoom.findFirst({
      where: {
        auction: { id: auctionId },
      },
      select: { id: true, hostId: true },
    });

    if (!room) {
      throw new NotFoundException('Auction room not found');
    }

    if (room.hostId === userId) {
      return { isHost: true };
    }

    // Check if user is an active team owner in this auction
    const ownershipRecord = await this.prisma.teamOwner.findFirst({
      where: {
        auctionId,
        userId,
        releasedAt: null,
      },
      select: { auctionTeamId: true },
    });

    if (!ownershipRecord) {
      throw new ForbiddenException('Not authorized to export this auction');
    }

    return { isHost: false, authorizedTeamId: ownershipRecord.auctionTeamId };
  }

  /**
   * Fetch auction metadata and teams with acquisitions in a single transaction.
   * Ensures consistent state across authorization boundary.
   */
  async getSquadExportData(
    auctionId: string,
    authorizedTeamId?: string
  ): Promise<SquadExportResponse> {
    // Wrap reads in transaction for consistency
    return await this.prisma.$transaction(
      async (tx: any) => {
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          select: {
            id: true,
            room: {
              select: { id: true, name: true },
            },
          },
        });

        if (!auction) {
          throw new NotFoundException('Auction not found');
        }

        // Filter teams: if authorizedTeamId provided, return only that team
        const teamFilter = authorizedTeamId ? { id: authorizedTeamId } : {};

        const teams = await tx.auctionTeam.findMany({
          where: { auctionId, ...teamFilter },
          include: {
            team: { select: { name: true, primaryColor: true } },
            acquisitions: {
              include: {
                auctionPlayer: {
                  include: {
                    player: {
                      select: {
                        id: true,
                        fullName: true,
                        displayName: true,
                        role: true,
                        category: { select: { name: true } },
                      },
                    },
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
            owners: {
              where: { releasedAt: null },
              include: {
                user: { select: { id: true, displayName: true } },
              },
            },
            validations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                violations: {
                  select: {
                    violationType: true,
                    currentCount: true,
                    requiredMinCount: true,
                    requiredMaxCount: true,
                    squadRule: { select: { type: true } },
                  },
                },
              },
            },
            purseLedger: {
              select: { amountMinor: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        return {
          auctionId: auction.id,
          auctionName: `Auction-${auction.id.substring(0, 8)}`, // No separate name in schema
          roomName: auction.room.name,
          exportedAt: new Date().toISOString(),
          teams: teams.map((team: any) => ({
            auctionTeamId: team.id,
            teamName: team.team.name,
            teamColor: team.team.primaryColor || '#000000',
            owners: team.owners.map((owner: any) => ({
              userId: owner.userId,
              displayName: owner.user.displayName || `User ${owner.userId.substring(0, 8)}`,
            })),
            acquisitions: team.acquisitions.map((acq: any) => ({
              playerName: acq.auctionPlayer.player.displayName,
              playerRole: acq.auctionPlayer.player.role,
              playerCategory: acq.auctionPlayer.player.category?.name || 'Uncategorized',
              priceMinor: acq.priceMinor.toString(), // BigInt → string
            })),
            purseBalanceMinor: team.purseBalanceMinor.toString(), // BigInt → string
            complianceStatus: this.formatComplianceStatus(team.validations[0]),
          })),
        };
      },
      { isolationLevel: 'ReadCommitted' }
    );
  }

  async exportSquadCsv(auctionId: string, userId: string): Promise<string> {
    const auth = await this.verifyExportAuthorization(auctionId, userId);
    const data = await this.getSquadExportData(auctionId, auth.authorizedTeamId);

    const rows: ExportDataRow[] = [];

    for (const team of data.teams) {
      if (team.acquisitions.length === 0) {
        rows.push({
          teamName: this.escapeFormulaInjection(team.teamName),
          teamColor: team.teamColor,
          teamOwners: team.owners.map((o) => o.displayName).join(', '),
          playerName: '(no players)',
          playerRole: '',
          playerCategory: '',
          acquisitionPriceMinor: '',
          purseBalanceMinor: team.purseBalanceMinor,
          complianceStatus: this.formatComplianceStatusString(team.complianceStatus),
        });
      } else {
        for (const acq of team.acquisitions) {
          rows.push({
            teamName: this.escapeFormulaInjection(team.teamName),
            teamColor: team.teamColor,
            teamOwners: team.owners.map((o) => o.displayName).join(', '),
            playerName: this.escapeFormulaInjection(acq.playerName),
            playerRole: acq.playerRole,
            playerCategory: acq.playerCategory,
            acquisitionPriceMinor: acq.priceMinor,
            purseBalanceMinor: team.purseBalanceMinor,
            complianceStatus: this.formatComplianceStatusString(team.complianceStatus),
          });
        }
      }
    }

    try {
      const csv = Papa.unparse(rows, {
        header: true,
        quotes: true,
        quoteChar: '"',
        escapeChar: '"',
      });
      return csv;
    } catch (error) {
      this.logger.error(`CSV export failed for auction ${auctionId}`, error);
      throw new InternalServerErrorException('Failed to generate CSV export');
    }
  }

  async exportSquadXlsx(auctionId: string, userId: string): Promise<Buffer> {
    const auth = await this.verifyExportAuthorization(auctionId, userId);
    const data = await this.getSquadExportData(auctionId, auth.authorizedTeamId);

    try {
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
      headerRow.fill = {
        type: 'pattern' as any,
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      worksheet.views = [{ state: 'frozen' as any, ySplit: 1 }];

      for (const team of data.teams) {
        if (team.acquisitions.length === 0) {
          worksheet.addRow([
            this.escapeFormulaInjection(team.teamName),
            team.teamColor,
            team.owners.map((o) => o.displayName).join(', '),
            '(no players)',
            '',
            '',
            '',
            team.purseBalanceMinor,
            this.formatComplianceStatusString(team.complianceStatus),
          ]);
        } else {
          for (const acq of team.acquisitions) {
            worksheet.addRow([
              this.escapeFormulaInjection(team.teamName),
              team.teamColor,
              team.owners.map((o) => o.displayName).join(', '),
              this.escapeFormulaInjection(acq.playerName),
              acq.playerRole,
              acq.playerCategory,
              acq.priceMinor,
              team.purseBalanceMinor,
              this.formatComplianceStatusString(team.complianceStatus),
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
          row.eachCell((cell: any) => {
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            if (cell.col >= 7 && cell.col <= 8) {
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
          });
        }
      });

      return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    } catch (error) {
      this.logger.error(`XLSX export failed for auction ${auctionId}`, error);
      throw new InternalServerErrorException('Failed to generate XLSX export');
    }
  }

  /**
   * Format compliance status to structured object for contract.
   * Returns { valid: boolean, violations: [...] }
   */
  private formatComplianceStatus(
    validation: any
  ): ComplianceStatusDetail {
    if (!validation) {
      return { valid: true, violations: [] };
    }

    if (validation.violations && validation.violations.length > 0) {
      return {
        valid: false,
        violations: validation.violations.map((v: any) => ({
          ruleType: v.squadRule?.type || 'UNKNOWN',
          currentCount: v.currentCount,
          requiredMin: v.requiredMinCount,
          requiredMax: v.requiredMaxCount,
        })),
      };
    }

    return { valid: true, violations: [] };
  }

  /**
   * Convert compliance status to human-readable string for CSV/XLSX export.
   */
  private formatComplianceStatusString(status: ComplianceStatusDetail): string {
    if (status.valid) {
      return 'Compliant';
    }

    if (status.violations.length === 0) {
      return 'Compliant';
    }

    const violationSummary = status.violations
      .map((v) => `${v.ruleType}:${v.currentCount}`)
      .join(', ');
    return `Violations: ${violationSummary}`;
  }

  /**
   * Escape formula injection prefixes (=, +, -, @) by prepending single quote.
   * Also escapes unicode formula characters.
   */
  private escapeFormulaInjection(value: string): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    // Check for formula injection prefixes: =, +, -, @
    if (/^[\=\+\-\@]/.test(value.trim())) {
      return `'${value}`;
    }

    // Check for unicode formula injection (tab, newline with formulas)
    if (/^[\u0009\u000B\u000C][\=\+\-\@]/.test(value)) {
      return `'${value}`;
    }

    return value;
  }

  generateFilename(
    auctionId: string,
    roomName: string,
    auctionName: string,
    format: ExportFormat
  ): string {
    const sanitized = this.sanitizeFilename(roomName);
    const auctionSanitized = this.sanitizeFilename(auctionName);
    const shortId = auctionId.substring(0, 8);
    const timestamp = new Date().toISOString().split('T')[0];
    const ext = format === ExportFormat.CSV ? 'csv' : 'xlsx';
    return `squad_export_${shortId}_${sanitized}_${auctionSanitized}_${timestamp}.${ext}`;
  }

  private sanitizeFilename(input: string): string {
    if (!input) return 'export';
    let sanitized = input.replace(/[^\w\s\-.]/g, '_');
    sanitized = sanitized.replace(/[\s_]+/g, '_').trim().replace(/^_|_$/g, '');
    if (!sanitized) {
      sanitized = 'export';
    }
    return sanitized.substring(0, 100);
  }
}
