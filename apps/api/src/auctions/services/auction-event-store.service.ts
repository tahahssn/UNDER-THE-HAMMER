import { Injectable } from '@nestjs/common';
import { AuctionsRepository } from '../auctions.repository';

export type AuctionEventType =
  | 'AUCTION_CREATED'
  | 'AUCTION_STARTED'
  | 'PLAYER_INTRODUCED'
  | 'BID_ACCEPTED'
  | 'BID_REJECTED'
  | 'PLAYER_SOLD'
  | 'PLAYER_UNSOLD'
  | 'BREAK_STARTED'
  | 'BREAK_ENDED'
  | 'AUCTION_PAUSED'
  | 'AUCTION_RESUMED'
  | 'AUCTION_CONCLUDED'
  | 'PHASE_CHANGED'
  | 'PURSE_ADJUSTED'
  | 'COUNTDOWN_STARTED'
  | 'COUNTDOWN_UPDATED';

@Injectable()
export class AuctionEventStoreService {
  constructor(private readonly repo: AuctionsRepository) {}

  /**
   * Record an event atomically with sequence number and state version
   */
  async recordEvent(auctionId: string, type: AuctionEventType, payload: Record<string, any>, actorId?: string) {
    // Get current auction state to include stateVersion
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      throw new Error(`Auction ${auctionId} not found`);
    }

    return this.repo.recordAuctionEvent({
      auctionId,
      type,
      payload,
      actorId,
      stateVersion: auction.stateVersion,
    });
  }

  /**
   * Get events since a specific sequence (for reconnection recovery)
   */
  async getEventsSince(auctionId: string, fromSequence?: number) {
    return this.repo.getAuctionEventsSince(auctionId, fromSequence);
  }

  /**
   * Get all events for an auction
   */
  async getAllEvents(auctionId: string) {
    return this.repo.getAuctionEventsSince(auctionId);
  }

  /**
   * Get paginated events
   */
  async getEventsPaginated(auctionId: string, limit: number = 100, offset: number = 0) {
    const events = await this.repo.getAuctionEventsSince(auctionId);

    return {
      events: events.slice(offset, offset + limit),
      total: events.length,
      limit,
      offset,
    };
  }
}
