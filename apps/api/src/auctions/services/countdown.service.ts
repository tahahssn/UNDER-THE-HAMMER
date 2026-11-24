import { Injectable } from '@nestjs/common';
import { AuctionsRepository } from '../auctions.repository';

export interface CountdownState {
  deadline: Date;
  secondsRemaining: number;
}

@Injectable()
export class CountdownService {
  constructor(private readonly repo: AuctionsRepository) {}

  /**
   * Start countdown with specified duration
   */
  async startCountdown(auctionId: string, durationSeconds: number): Promise<CountdownState> {
    const now = new Date();
    const deadline = new Date(now.getTime() + durationSeconds * 1000);

    await this.repo.updateAuctionDeadline(auctionId, deadline);

    return {
      deadline,
      secondsRemaining: durationSeconds,
    };
  }

  /**
   * Get current countdown state
   */
  async getCountdownState(auctionId: string): Promise<CountdownState | null> {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction?.phaseDeadline) {
      return null;
    }

    const now = new Date();
    const secondsRemaining = Math.max(0, Math.ceil((auction.phaseDeadline.getTime() - now.getTime()) / 1000));

    return {
      deadline: auction.phaseDeadline,
      secondsRemaining,
    };
  }

  /**
   * Check if deadline has been reached
   */
  isDeadlineReached(auction: { phaseDeadline: Date | null }): boolean {
    if (!auction.phaseDeadline) {
      return false;
    }

    return new Date() >= auction.phaseDeadline;
  }

  /**
   * Extend countdown by specified seconds
   */
  async extendCountdown(auctionId: string, extensionSeconds: number): Promise<CountdownState> {
    const state = await this.getCountdownState(auctionId);

    if (!state) {
      throw new Error('No active countdown found');
    }

    const newDeadline = new Date(state.deadline.getTime() + extensionSeconds * 1000);

    await this.repo.updateAuctionDeadline(auctionId, newDeadline);

    const now = new Date();
    const secondsRemaining = Math.max(0, Math.ceil((newDeadline.getTime() - now.getTime()) / 1000));

    return {
      deadline: newDeadline,
      secondsRemaining,
    };
  }

  /**
   * Clear countdown
   */
  async clearCountdown(auctionId: string): Promise<void> {
    await this.repo.updateAuctionDeadline(auctionId, null);
  }
}
