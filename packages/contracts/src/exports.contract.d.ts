export declare enum ExportFormat {
    CSV = "csv",
    XLSX = "xlsx"
}
export interface SquadExportRequestDto {
    format: ExportFormat | string;
}
export interface ExportErrorResponse {
    statusCode: number;
    message: string;
    error: string;
    timestamp: string;
}
export interface SquadExportResponse {
    auctionId: string;
    auctionName: string;
    roomName: string;
    exportedAt: string;
    teams: Array<{
        auctionTeamId: string;
        teamName: string;
        teamColor: string;
        owners: Array<{
            userId: string;
            displayName: string;
        }>;
        acquisitions: Array<{
            playerName: string;
            playerRole: string;
            playerCategory: string;
            priceMinor: string;
        }>;
        purseBalanceMinor: string;
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
