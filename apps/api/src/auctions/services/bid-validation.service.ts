import { Injectable, BadRequestException } from '@nestjs/common';
import { AuctionsRepository } from '../auctions.repository';
import { PurseLedgerService } from './purse-ledger.service';
import { CountdownService } from './countdown.service';
import { BID_ERRORS, AUCTION_ERRORS } from '../constants/auction-errors';

@Injectable()
export class BidValidationService {
  constructor(
    private readonly repo: AuctionsRepository,
    private readonly purseLedger: PurseLedgerService,
    private readonly countdown: CountdownService
  ) {}

  /**
   * Validate bid placement with all checks
   */
  async validateBidPlacement(
    auctionId: string,
    teamId: string,
    amountMinor: bigint,
    stateVersion: number,
    idempotencyKey: string
  ): Promise<{ valid: true } | { valid: false; reason: string }> {
    // Check auction exists
    const auction = await this.repo.getAuctionById(auctionId);
    if (!auction) {
      return { valid: false, reason: AUCTION_ERRORS.AUCTION_NOT_FOUND };
    }

    // Check auction is in LIVE phase
    if (auction.phase !== 'LIVE') {
      return { valid: false, reason: AUCTION_ERRORS.AUCTION_NOT_LIVE };
    }

    // Check state version hasn't changed
    if (auction.stateVersion !== stateVersion) {
      return { valid: false, reason: BID_ERRORS.STATE_VERSION_MISMATCH };
    }

    // Check deadline not passed
    if (this.countdown.isDeadlineReached(auction)) {
      return { valid: false, reason: BID_ERRORS.DEADLINE_PASSED };
    }

    // Check no current player set (player should be active)
    if (!auction.currentAuctionPlayerId) {
      return { valid: false, reason: BID_ERRORS.INVALID_PLAYER };
    }

    // Check team exists in this auction
    const team = await this.repo.getAuctionTeamById(teamId);
    if (!team || team.auctionId !== auctionId) {
      return { valid: false, reason: BID_ERRORS.INVALID_TEAM };
    }

    // Check player not already sold
    const player = await this.repo.getAuctionPlayers(auctionId);
    const currentPlayer = player.find((p) => p.id === auction.currentAuctionPlayerId);
    if (currentPlayer?.status === 'SOLD') {
      return { valid: false, reason: BID_ERRORS.PLAYER_ALREADY_SOLD };
    }

    // Check no duplicate bid with same idempotency key
    const existing = await this.repo.getBidByIdempotencyKey(auctionId, idempotencyKey);
    if (existing) {
      // If exists but not accepted, it's a duplicate
      if (!existing.accepted) {
        return { valid: false, reason: BID_ERRORS.DUPLICATE_BID };
      }
      // If accepted, it's idempotent retry - allow (will be handled in service layer)
    }

    // Calculate minimum bid
    const minimumBid = await this.computeMinimumBid(auctionId, auction.highBidMinor);
    if (amountMinor < minimumBid) {
      return { valid: false, reason: BID_ERRORS.BELOW_MINIMUM };
    }

    // Check team has sufficient purse
    const balance = await this.purseLedger.getBalance(teamId);
    if (balance < amountMinor) {
      return { valid: false, reason: BID_ERRORS.INSUFFICIENT_PURSE };
    }

    return { valid: true };
  }

  /**
   * Compute minimum bid for the current player based on increment brackets
   */
  async computeMinimumBid(auctionId: string, currentBidMinor: bigint | null): Promise<bigint> {
    const startingPrice = 10_000_000n; // PKR 10 lakh base

    if (!currentBidMinor || currentBidMinor === 0n) {
      return startingPrice;
    }

    // Fetch increment brackets from database
    const brackets = await this.repo.getAuctionPlayers(auctionId);

    // PKR amounts for bracket lookup
    const PKR_1_CRORE = 100_000_000n;
    const PKR_2_2_CRORE = 220_000_000n;
    const PKR_4_CRORE = 400_000_000n;

    let increment: bigint;

    if (currentBidMinor < PKR_1_CRORE) {
      // Below 1 crore: +10 lakh
      increment = 10_000_000n;
    } else if (currentBidMinor < PKR_2_2_CRORE) {
      // 1 crore to below 2.2 crore: +15 lakh
      increment = 15_000_000n;
    } else if (currentBidMinor < PKR_4_CRORE) {
      // 2.2 crore to below 4 crore: +20 lakh
      increment = 20_000_000n;
    } else {
      // 4 crore and above: +25 lakh
      increment = 25_000_000n;
    }

    return currentBidMinor + increment;
  }

  /**
   * Check if a bid with given idempotency key was already processed
   */
  async checkIdempotency(auctionId: string, idempotencyKey: string): Promise<string | null> {
    const existing = await this.repo.getBidByIdempotencyKey(auctionId, idempotencyKey);
    return existing?.id ?? null;
  }

  /**
   * Validate the bid increment is correct
   */
  async validateIncrement(
    auctionId: string,
    proposedBidMinor: bigint,
    minimumBid: bigint
  ): Promise<boolean> {
    return proposedBidMinor >= minimumBid;
  }
}
