import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionsRepository } from '../auctions.repository';

@Injectable()
export class PlayerSelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuctionsRepository
  ) {}

  /**
   * Manual selection: host picks next player from queue
   */
  async selectPlayerManual(auctionId: string, playerId: string) {
    // Verify player exists and is in this auction
    const player = await this.prisma.auctionPlayer.findUnique({
      where: { id: playerId },
    });

    if (!player || player.auctionId !== auctionId) {
      throw new BadRequestException('Player not found in this auction');
    }

    if (player.status !== 'QUEUED') {
      throw new BadRequestException(`Player is not queued (status: ${player.status})`);
    }

    // Set as current player
    await this.repo.updateCurrentPlayer(auctionId, playerId);

    // Update player status
    return this.prisma.auctionPlayer.update({
      where: { id: playerId },
      data: { status: 'ACTIVE', selectionSource: 'MANUAL' },
    });
  }

  /**
   * Automatic draw: system randomly selects from queued players
   */
  async drawPlayerAutomatic(auctionId: string) {
    // Get all queued players
    const queuedPlayers = await this.repo.getAuctionPlayers(auctionId, 'QUEUED');

    if (queuedPlayers.length === 0) {
      throw new BadRequestException('No queued players available');
    }

    // Random selection
    const randomIndex = Math.floor(Math.random() * queuedPlayers.length);
    const selectedPlayer = queuedPlayers[randomIndex];

    // Set as current player
    await this.repo.updateCurrentPlayer(auctionId, selectedPlayer.id);

    // Update player status
    return this.prisma.auctionPlayer.update({
      where: { id: selectedPlayer.id },
      data: { status: 'ACTIVE', selectionSource: 'AUTOMATIC' },
    });
  }

  /**
   * Get current active player for auction
   */
  async getCurrentPlayer(auctionId: string) {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction?.currentAuctionPlayerId) {
      return null;
    }

    return this.prisma.auctionPlayer.findUnique({
      where: { id: auction.currentAuctionPlayerId },
      include: { player: true },
    });
  }

  /**
   * Get ordered queue of players
   */
  async getPlayerQueue(auctionId: string) {
    return this.repo.getAuctionPlayers(auctionId, 'QUEUED');
  }

  /**
   * Withdraw player from auction (host action)
   */
  async withdrawPlayer(auctionId: string, playerId: string) {
    const player = await this.prisma.auctionPlayer.findUnique({
      where: { id: playerId },
    });

    if (!player || player.auctionId !== auctionId) {
      throw new BadRequestException('Player not found in this auction');
    }

    // Update player status
    return this.prisma.auctionPlayer.update({
      where: { id: playerId },
      data: { status: 'WITHDRAWN' },
    });
  }

  /**
   * Mark player as sold
   */
  async markPlayerSold(auctionId: string, playerId: string, teamId: string, priceMinor: bigint) {
    const player = await this.prisma.auctionPlayer.findUnique({
      where: { id: playerId },
    });

    if (!player || player.auctionId !== auctionId) {
      throw new BadRequestException('Player not found');
    }

    return this.prisma.auctionPlayer.update({
      where: { id: playerId },
      data: {
        status: 'SOLD',
        selledTeamId: teamId,
        selledFor: priceMinor,
      },
    });
  }

  /**
   * Mark player as unsold
   */
  async markPlayerUnsold(auctionId: string, playerId: string) {
    const player = await this.prisma.auctionPlayer.findUnique({
      where: { id: playerId },
    });

    if (!player || player.auctionId !== auctionId) {
      throw new BadRequestException('Player not found');
    }

    return this.prisma.auctionPlayer.update({
      where: { id: playerId },
      data: {
        status: 'UNSOLD',
        selledTeamId: null,
        selledFor: null,
      },
    });
  }

  /**
   * Advance to next player in queue
   */
  async advanceToNextPlayer(auctionId: string) {
    // Get next queued player
    const players = await this.repo.getAuctionPlayers(auctionId, 'QUEUED');

    if (players.length === 0) {
      // No more players
      await this.repo.updateCurrentPlayer(auctionId, null);
      return null;
    }

    // Set first queued as current
    const nextPlayer = players[0];
    await this.repo.updateCurrentPlayer(auctionId, nextPlayer.id);

    return this.prisma.auctionPlayer.update({
      where: { id: nextPlayer.id },
      data: { status: 'ACTIVE' },
    });
  }
}
