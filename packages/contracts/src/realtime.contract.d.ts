/**
 * Real-time WebSocket event contracts for auction rooms
 * Shared between frontend and backend for type safety
 */
export interface BreakStartedEvent {
    type: 'break:started';
    auctionId: string;
    breakId: string;
    startedAt: string;
    deadline: string;
    durationSeconds: number;
    reason?: string;
    timestamp: string;
}
export interface BreakUpdatedEvent {
    type: 'break:updated';
    auctionId: string;
    breakId: string;
    newDeadline: string;
    adjustmentSeconds: number;
    timestamp: string;
}
export interface BreakEndedEvent {
    type: 'break:ended';
    auctionId: string;
    breakId: string;
    endedAt: string;
    timestamp: string;
}
export interface BreakStateSnapshot {
    breakId: string;
    startedAt: string;
    deadline: string;
    originalDurationSeconds: number;
    secondsRemaining: number;
    reason?: string;
    isActive: boolean;
}
export interface ChatMessageEvent {
    type: 'chat:message';
    messageId: string;
    from: string;
    message: string;
    timestamp: string;
    isModerationHeld: boolean;
    authorRole: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
}
export interface ChatUserMutedEvent {
    type: 'chat:user-muted';
    targetUserId: string;
    expiresAt: string;
    reason?: string;
    timestamp: string;
}
export interface ChatUserUnmutedEvent {
    type: 'chat:user-unmuted';
    targetUserId: string;
    timestamp: string;
}
export interface ChatMessageHistoryDto {
    messageId: string;
    from: string;
    message: string;
    timestamp: string;
    isModerationHeld: boolean;
}
export interface PresenceParticipant {
    userId: string;
    role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
    teamId?: string;
    joinedAt: string;
    connectionState: 'connected' | 'reconnecting';
    isYou?: boolean;
}
export interface RoomPresenceEvent {
    type: 'room:presence';
    participants: PresenceParticipant[];
    timestamp: string;
}
export interface RoomJoinedEvent {
    type: 'room:joined';
    roomId: string;
    participants: PresenceParticipant[];
    activeBidderId?: string;
}
export interface ActiveBidderChangedEvent {
    type: 'auction:active-bidder-changed';
    activeBidderId: string | null;
    timestamp: string;
}
export type BreakEvent = BreakStartedEvent | BreakUpdatedEvent | BreakEndedEvent;
export type ChatEvent = ChatMessageEvent | ChatUserMutedEvent | ChatUserUnmutedEvent;
export type PresenceEvent = RoomPresenceEvent | RoomJoinedEvent | ActiveBidderChangedEvent;
export type RealtimeEvent = BreakEvent | ChatEvent | PresenceEvent;
export interface BreakStartCommand {
    type: 'break:start';
    auctionId: string;
    durationSeconds: number;
    reason?: string;
}
export interface BreakAdjustCommand {
    type: 'break:adjust';
    auctionId: string;
    adjustmentSeconds: number;
}
export interface BreakResumeCommand {
    type: 'break:resume';
    auctionId: string;
}
export interface BreakRequestStateCommand {
    type: 'break:request-state';
    auctionId: string;
}
export interface ChatSendCommand {
    type: 'chat:send';
    roomId: string;
    message: string;
}
export interface ChatMuteUserCommand {
    type: 'chat:mute-user';
    roomId: string;
    targetUserId: string;
    durationSeconds?: number;
    reason?: string;
}
export interface ChatUnmuteUserCommand {
    type: 'chat:unmute-user';
    roomId: string;
    targetUserId: string;
}
export interface ChatRequestHistoryCommand {
    type: 'chat:request-history';
    roomId: string;
    limit?: number;
}
export interface RoomJoinCommand {
    type: 'room:join';
    roomId: string;
    auctionId: string;
    role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
    teamId?: string;
}
export interface RoomLeaveCommand {
    type: 'room:leave';
    roomId: string;
}
export interface RoomRequestPresenceCommand {
    type: 'room:request-presence';
    roomId: string;
    includeEvents?: boolean;
    eventCount?: number;
}
export type ClientCommand = BreakStartCommand | BreakAdjustCommand | BreakResumeCommand | BreakRequestStateCommand | ChatSendCommand | ChatMuteUserCommand | ChatUnmuteUserCommand | ChatRequestHistoryCommand | RoomJoinCommand | RoomLeaveCommand | RoomRequestPresenceCommand;
export interface GatewayErrorResponse {
    code: 'UNAUTHORIZED' | 'NOT_ROOM_MEMBER' | 'ROOM_NOT_FOUND' | 'AUCTION_NOT_FOUND' | 'NO_ACTIVE_BREAK' | 'DURATION_TOO_SHORT' | 'DURATION_TOO_LONG' | 'ADJUSTMENT_EXCEEDS_LIMIT' | 'INVALID_MESSAGE_LENGTH' | 'RATE_LIMITED' | 'USER_MUTED' | 'TARGET_NOT_MEMBER' | 'ROLE_MISMATCH' | 'INTERNAL_ERROR';
    message?: string;
}
