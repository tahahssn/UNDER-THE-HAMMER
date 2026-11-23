export interface PlayerCategoryDto {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
}

export interface CountryDto {
  code: string;
  name: string;
}

export interface PlayerListItem {
  id: string;
  displayName: string;
  role: string;
  category?: PlayerCategoryDto;
  country?: CountryDto;
  categoryId?: string;
}

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
  statistics: Record<string, PlayerStatisticDto[]>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerSearchResponse {
  players: PlayerListItem[];
  total: number;
  hasMore: boolean;
}

export interface PlayerSearchQuery {
  search?: string;
  category?: string;
  role?: string;
  country?: string;
  skip: number;
  take: number;
}
