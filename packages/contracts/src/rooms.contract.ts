/**
 * Rooms and team allocation contract types.
 * Used for API responses and cross-module communication.
 */

export interface RoomSettingsConfigDto {
  teamCount: number; // 2-16
  teamPurseMinor: bigint; // Integer in minor units
  currency: string;
  format: 'LIVE_COUNTDOWN' | 'TURN_BASED';
  controlMode: 'HOST_CONTROLLED' | 'SYSTEM_AUTOMATIC';
  playerSelectionMode: 'MANUAL' | 'AUTOMATIC_DRAW';
  hostParticipates: boolean;
  countdownDurationSeconds: number;
  turnDurationSeconds: number;
  breakAfterBidCount: number;
  breakDurationSeconds: number;
  maxBreakAdjustments: number;
  bidIncrementBrackets: Array<{
    fromMinor: bigint;
    toMinor: bigint;
    incrementMinor: bigint;
  }>;
  squadSizeMin: number;
  squadSizeMax: number;
  squadRules: Array<{
    type: string; // SQUAD_SIZE, ROLE_COUNT, CATEGORY_COUNT, etc
    role?: string;
    categoryId?: string;
    minCount?: number;
    maxCount?: number;
  }>;
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
  joinPolicy: 'FIRST_COME_FIRST_SERVED' | 'APPROVAL' | 'INVITATION' | 'CODE';
  spectatorPolicy: 'PUBLIC' | 'RESTRICTED';
  teamOwnerCapacity: number;
  spectatorCapacity: number;
  lateJoinPolicy: 'DISALLOWED' | 'ALLOWED_BEFORE_FIRST_BID' | 'ALLOWED';
  spectatorChatEnabled: boolean;
  externalLinksEnabled: boolean;
}

export interface RoomMemberDto {
  id: string;
  userId: string;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'LEFT' | 'REMOVED' | 'BANNED';
  joinedAt: string;
  leftAt: string | null;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface AuctionTeamDto {
  id: string;
  auctionId: string;
  teamId: string;
  slotIndex: number;
  allocationMethod: 'USER_SELECTED' | 'RANDOM' | 'CUSTOM' | null;
  purseInitialMinor: bigint;
  purseBalanceMinor: bigint;
  createdAt: string;
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
    method: 'USER_SELECTED' | 'RANDOM' | 'CUSTOM';
    assignedAt: string;
    user?: {
      id: string;
      email: string;
      displayName: string;
    };
  }>;
}

export interface TeamOwnerDto {
  id: string;
  auctionTeamId: string;
  userId: string;
  method: 'USER_SELECTED' | 'RANDOM' | 'CUSTOM';
  assignedAt: string;
  releasedAt: string | null;
}

export interface AllocationResultDto {
  success: boolean;
  auctionTeamId?: string;
  teamId?: string;
  slotIndex?: number;
  error?: string;
}

export interface RoomDto {
  id: string;
  tournamentId: string | null;
  hostId: string;
  name: string;
  status: 'DRAFT' | 'REGISTRATION' | 'READY' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
  visibility: 'PUBLIC' | 'PRIVATE';
  listed: boolean;
  currentSettingsVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomDetailDto extends RoomDto {
  host?: {
    id: string;
    email: string;
    displayName: string;
  };
  settings?: RoomSettingsDto;
  accessPolicy?: RoomAccessPolicyDto;
  memberCount?: number;
  teams?: AuctionTeamDto[];
  members?: RoomMemberDto[];
}

export interface RoomInvitationDto {
  id: string;
  roomId: string;
  createdById: string;
  inviteeUserId: string | null;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  expiresAt: string | null;
  revokedAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
}

export interface RoomInvitationWithCodeDto extends RoomInvitationDto {
  code: string; // Plain code, shown once
}

export interface RoomListResponse {
  rooms: RoomDto[];
  total: number;
  hasMore: boolean;
}

export interface JoinRoomRequestDto {
  code?: string;
  role: 'TEAM_OWNER' | 'SPECTATOR';
}

export interface RoomMemberListResponse {
  members: RoomMemberDto[];
  total: number;
}
