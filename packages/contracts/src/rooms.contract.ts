/**
 * Auction room, settings, membership and team allocation contracts.
 * Rooms are the container for hosted auctions with configurable settings and access policies.
 */

export interface RoomSettingsConfigDto {
  // Flexible auction configuration validated by shared schemas
  // Examples: controlMode, format, playerSelection, hostParticipates, teamAllocationMode, etc.
  [key: string]: unknown;
}

export interface RoomSettingsDto {
  id: string;
  roomId: string;
  version: number;
  config: RoomSettingsConfigDto;
  createdAt: string;
}

export interface RoomAccessPolicyDto {
  roomId: string;
  joinPolicy: "FIRST_COME_FIRST_SERVED" | "APPROVAL" | "INVITATION" | "CODE";
  spectatorPolicy: "PUBLIC" | "RESTRICTED";
  teamOwnerCapacity: number;
  spectatorCapacity: number;
  lateJoinPolicy: "DISALLOWED" | "ALLOWED_BEFORE_FIRST_BID" | "ALLOWED";
  spectatorChatEnabled: boolean;
  externalLinksEnabled: boolean;
}

export interface RoomMemberDto {
  id: string;
  roomId: string;
  userId: string;
  role: "HOST" | "TEAM_OWNER" | "SPECTATOR";
  status: "PENDING_APPROVAL" | "ACTIVE" | "LEFT" | "REMOVED" | "BANNED";
  joinedAt: string;
  leftAt?: string;
}

export interface AuctionTeamDto {
  id: string;
  auctionId: string;
  teamId: string;
  slotIndex: number;
  allocationMethod?: "USER_SELECTED" | "RANDOM" | "CUSTOM" | "HOST_ASSIGNED";
  purseInitialMinor: bigint;
  purseBalanceMinor: bigint;
  createdAt: string;
}

export interface AuctionTeamDetailDto extends AuctionTeamDto {
  team?: {
    id: string;
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor?: string;
  };
  owners?: Array<{
    id: string;
    userId: string;
    method: string;
    assignedAt: string;
  }>;
}

export interface TeamOwnerDto {
  id: string;
  auctionId: string;
  auctionTeamId: string;
  userId: string;
  method: "USER_SELECTED" | "RANDOM" | "CUSTOM" | "HOST_ASSIGNED";
  assignedAt: string;
  releasedAt?: string;
}

export interface AllocationResultDto {
  auctionId: string;
  teamAllocations: Array<{
    auctionTeamId: string;
    teamId: string;
    slotIndex: number;
    assignedOwnerIds: string[];
  }>;
}

export interface RoomDto {
  id: string;
  tournamentId?: string;
  hostId: string;
  name: string;
  status: "DRAFT" | "REGISTRATION" | "READY" | "LIVE" | "COMPLETED" | "CANCELLED";
  visibility: "PUBLIC" | "PRIVATE";
  listed: boolean;
  currentSettingsVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomDetailDto extends RoomDto {
  host?: {
    id: string;
    displayName?: string;
  };
  accessPolicy?: RoomAccessPolicyDto;
  currentSettings?: RoomSettingsDto;
  memberCount?: number;
}

export interface RoomInvitationDto {
  id: string;
  roomId: string;
  createdById: string;
  inviteeUserId?: string;
  role: "HOST" | "TEAM_OWNER" | "SPECTATOR";
  expiresAt?: string;
  revokedAt?: string;
  maxUses?: number;
  useCount: number;
  createdAt: string;
}

export interface RoomInvitationWithCodeDto extends RoomInvitationDto {
  code?: string; // Shown only at creation
}

export interface RoomListResponse {
  rooms: RoomDetailDto[];
  total: number;
  hasMore: boolean;
}

export interface JoinRoomRequestDto {
  roomId: string;
  code?: string;
  role?: "TEAM_OWNER" | "SPECTATOR";
}

export interface RoomMemberListResponse {
  members: RoomMemberDto[];
  total: number;
}
