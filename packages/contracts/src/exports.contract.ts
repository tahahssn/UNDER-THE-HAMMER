export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
}

export interface SquadExportRequestDto {
  format: ExportFormat | string; // Validation happens on backend
}

export interface ExportErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
}

/**
 * BigInt values (priceMinor, purseBalanceMinor) are serialized as JSON strings.
 * Frontend should parse with BigInt(value) for calculations or Number(value) for display.
 */
export interface SquadExportResponse {
  auctionId: string;
  auctionName: string;
  roomName: string;
  exportedAt: string; // ISO 8601 UTC
  teams: Array<{
    auctionTeamId: string;
    teamName: string;
    teamColor: string;
    owners: Array<{
      userId: string;
      displayName: string; // username || email || 'User {id}'
    }>;
    acquisitions: Array<{
      playerName: string;
      playerRole: string;
      playerCategory: string;
      priceMinor: string; // BigInt as string
    }>;
    purseBalanceMinor: string; // BigInt as string
    complianceStatus: {
      valid: boolean;
      violations: Array<{
        ruleType: string;
        currentCount: number;
        requiredMin?: number;
        requiredMax?: number;
      }>;
    };
  }>;
}
