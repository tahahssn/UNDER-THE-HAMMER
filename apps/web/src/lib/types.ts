/**
 * Shared TypeScript types and DTOs
 */

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDTO {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo?: string;
  primaryColor: string;
  secondaryColor?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  name: string;
  role: 'batsman' | 'bowler' | 'all-rounder' | 'wicket-keeper';
  country?: string;
  stats?: {
    matches: number;
    runs: number;
    wickets: number;
  };
  createdAt: string;
  updatedAt: string;
}

// Phase E: Player Directory
export type PlayerRoleType = 'BATTER' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKETKEEPER';
export type BattingStyle = 'LEFT_HAND' | 'RIGHT_HAND';

export interface CountryDto {
  code: string;
  name: string;
}

export interface PlayerCategoryDto {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
}

export interface PlayerStatistic {
  format: string; // TEST, ODI, T20I, T20, etc.
  matches?: number;
  runs?: number;
  wickets?: number;
  battingAverage?: number;
  strikeRate?: number;
  bowlingAverage?: number;
  bowlingEconomy?: number;
  asOf?: string;
}

export interface PlayerListItem {
  id: string;
  displayName: string;
  role: PlayerRoleType;
  category?: PlayerCategoryDto;
  country?: CountryDto;
  categoryId?: string;
}

export interface PlayerDetailDto {
  id: string;
  fullName: string;
  displayName: string;
  role: PlayerRoleType;
  battingStyle?: BattingStyle;
  bowlingStyle?: string;
  dateOfBirth?: string;
  country?: CountryDto;
  category?: PlayerCategoryDto;
  aliases: string[];
  statistics: Record<string, PlayerStatistic[]>;
}

export interface PlayerSearchQuery {
  search?: string;
  category?: string;
  role?: PlayerRoleType;
  country?: string;
  skip: number;
  take: number;
}

export interface PlayerSearchResponse {
  players: PlayerListItem[];
  total: number;
  hasMore: boolean;
}

// Phase E: Teams
export type TeamStatus = 'ACTIVE' | 'ARCHIVED' | 'DISABLED';

export interface TeamCreateDto {
  name: string;
  shortName: string;
  description?: string;
  primaryColor: string;
  secondaryColor?: string;
  countryCode?: string;
}

export interface TeamUpdateDto {
  name?: string;
  shortName?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  countryCode?: string;
}

export interface UserSummary {
  id: string;
  displayName: string;
  email?: string;
}

export interface FileAssetDto {
  id: string;
  kind: 'TEAM_LOGO' | 'USER_AVATAR' | 'EXPORT_IMAGE';
  status: 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'REJECTED' | 'DISABLED' | 'DELETED';
  objectKey: string;
  bucket: string;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  uploadedBy?: UserSummary;
  rightsConfirmed: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TeamDetailDto {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  primaryColor: string;
  secondaryColor?: string;
  countryCode?: string;
  status: TeamStatus;
  currentLogo?: FileAssetDto;
  currentLogoAssetId?: string;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt?: string;
}

export interface TeamListItem {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor?: string;
  currentLogoAssetId?: string;
  createdBy: { displayName: string };
}

export interface TeamListResponse {
  teams: TeamListItem[];
  total: number;
  hasMore: boolean;
}

// Phase E: File Upload
export type FileAssetKind = 'TEAM_LOGO' | 'USER_AVATAR' | 'EXPORT_IMAGE';

export interface UploadIntentRequest {
  kind: FileAssetKind;
  teamId?: string;
  filename: string;
  fileSizeBytes: number;
  declaredMimeType: string;
}

export interface UploadIntentResponse {
  uploadId: string;
  presignedUrl: string;
  expiresAt: string;
}

export interface ConfirmUploadRequest {
  uploadId: string;
  sha256Hash: string;
  actualMimeType: string;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
}

export interface Auction {
  id: string;
  title: string;
  status: 'draft' | 'scheduled' | 'live' | 'completed';
  format: 'countdown' | 'turn-based';
  control: 'host-controlled' | 'automatic';
  hostId: string;
  teams: Team[];
  teamCount: number;
  startTime: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuctionRoom {
  id: string;
  auctionId: string;
  visibility: 'public' | 'private';
  code?: string;
  currentPlayer?: Player;
  currentBid?: number;
  biddingTeam?: Team;
  createdAt: string;
  updatedAt: string;
}

export interface News {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author?: string;
  source?: string;
  imageUrl?: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  id: string;
  status: 'scheduled' | 'live' | 'completed';
  team1: {
    name: string;
    logo?: string;
    runs?: number;
    wickets?: number;
  };
  team2: {
    name: string;
    logo?: string;
    runs?: number;
    wickets?: number;
  };
  venue?: string;
  startTime: string;
  endTime?: string;
  winner?: string;
  dataProvider?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  user: UserDTO;
  token: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
