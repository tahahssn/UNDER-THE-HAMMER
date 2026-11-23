export interface PlayerStatisticDto {
  format: string;
  matches?: number;
  runs?: number;
  battingAverage?: number;
  strikeRate?: number;
  wickets?: number;
  bowlingAverage?: number;
  bowlingEconomy?: number;
  asOf: string;
  provider?: { name: string; licenseNotes?: string };
}

export interface PlayerDetailDto {
  id: string;
  fullName: string;
  displayName: string;
  role: string;
  battingStyle?: string;
  bowlingStyle?: string;
  dateOfBirth?: string;
  country?: { code: string; name: string };
  category?: { id: string; key: string; name: string };
  categoryId?: string;
  aliases: string[];
  statistics: Map<string, PlayerStatisticDto[]>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
