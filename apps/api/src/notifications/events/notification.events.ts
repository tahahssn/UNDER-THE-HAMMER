/**
 * Domain events emitted by other modules that trigger notifications.
 * NotificationService subscribes to these events and dispatches notifications accordingly.
 */

export interface BidAcceptedEvent {
  eventType: 'bid.accepted';
  bidId: string;
  bidderId: string;
  playerId: string;
  roomId: string;
  auctionId: string;
  bidAmount: number;
  currency: string;
  playerName: string;
  timestamp: Date;
}

export interface BreakStartedEvent {
  eventType: 'break.started';
  roomId: string;
  auctionId: string;
  breakDurationSeconds: number;
  timestamp: Date;
}

export interface BreakEndedEvent {
  eventType: 'break.ended';
  roomId: string;
  auctionId: string;
  timestamp: Date;
}

export interface AuctionEndedEvent {
  eventType: 'auction.ended';
  auctionId: string;
  roomId: string;
  hostId: string;
  timestamp: Date;
}

export interface SubscriptionExpiringEvent {
  eventType: 'subscription.expiring';
  hostId: string;
  subscriptionId: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  timestamp: Date;
}

export type DomainEvent =
  | BidAcceptedEvent
  | BreakStartedEvent
  | BreakEndedEvent
  | AuctionEndedEvent
  | SubscriptionExpiringEvent;
