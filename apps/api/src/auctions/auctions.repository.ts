import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuctionsRepository {
  constructor(public readonly prisma: PrismaService) {}

  async createAuction(data: any) {
    return this.prisma.auction.create({ data });
  }

  async getAuctionById(auctionId: string) {
    return this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        room: true,
        teams: { include: { team: true } },
        players: true,
        bids: true,
      },
    });
  }

  async getAuctionByRoomId(roomId: string) {
    return this.prisma.auction.findUnique({
      where: { roomId },
      include: {
        room: true,
        teams: true,
        players: true,
      },
    });
  }

  async updateAuctionPhase(auctionId: string, phase: string, stateVersion: number) {
    return this.prisma.auction.update({
      where: { id: auctionId },
      data: {
        phase: phase as any,
        stateVersion: { increment: 1 },
      },
    });
  }

  async updateAuctionDeadline(auctionId: string, deadline: Date | null) {
    return this.prisma.auction.update({
      where: { id: auctionId },
      data: { phaseDeadline: deadline },
    });
  }

  async updateCurrentPlayer(auctionId: string, playerId: string | null) {
    return this.prisma.auction.update({
      where: { id: auctionId },
      data: { currentAuctionPlayerId: playerId },
    });
  }

  async updateHighBid(auctionId: string, bidId: string, amountMinor: bigint, teamId: string) {
    // High bid is now stored on AuctionPlayer, not Auction
    // This method is kept for backwards compatibility but does nothing
    return;
  }

  async getAuctionPlayers(auctionId: string, status?: string) {
    const where = status ? { auctionId, status } : { auctionId };
    return this.prisma.auctionPlayer.findMany({
      where,
      orderBy: { queuePosition: 'asc' },
      include: { player: true },
    });
  }

  async getAuctionTeams(auctionId: string) {
    return this.prisma.auctionTeam.findMany({
      where: { auctionId },
      include: {
        team: true,
        acquisitions: { include: { player: true } },
      },
    });
  }

  async getAuctionTeamById(auctionTeamId: string) {
    return this.prisma.auctionTeam.findUnique({
      where: { id: auctionTeamId },
      include: {
        team: true,
        acquisitions: { include: { player: true } },
      },
    });
  }

  async recordBid(data: any) {
    return this.prisma.bid.create({ data });
  }

  async getBidByIdempotencyKey(auctionId: string, idempotencyKey: string) {
    return this.prisma.bid.findFirst({
      where: { auctionId, idempotencyKey },
    });
  }

  async recordAcquisition(data: any) {
    return this.prisma.playerAcquisition.create({ data });
  }

  async getAcquisitionsByAuctionTeam(auctionTeamId: string) {
    return this.prisma.playerAcquisition.findMany({
      where: { auctionTeamId },
      include: { player: true },
    });
  }

  async recordPurseTransaction(data: any) {
    return this.prisma.teamPurseTransaction.create({ data });
  }

  async getTeamPurseBalance(auctionTeamId: string): Promise<bigint> {
    const result = await this.prisma.teamPurseTransaction.aggregate({
      where: { auctionTeamId },
      _sum: { amountChangeMinor: true },
    });
    return result._sum.amountChangeMinor || 0n;
  }

  async recordAuctionEvent(data: any) {
    return this.prisma.auctionEvent.create({ data });
  }

  async getAuctionEventsSince(auctionId: string, fromSequence?: number) {
    const where = fromSequence ? { auctionId, sequence: { gt: fromSequence } } : { auctionId };
    return this.prisma.auctionEvent.findMany({
      where,
      orderBy: { sequence: 'asc' },
    });
  }

  async recordHostAction(data: any) {
    return this.prisma.auctionHostAction.create({ data });
  }

  async recordTurn(data: any) {
    return this.prisma.auctionTurn.create({ data });
  }

  async getCurrentTurn(auctionId: string, auctionPlayerId: string) {
    return this.prisma.auctionTurn.findFirst({
      where: { auctionId, auctionPlayerId, completedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordBreak(data: any) {
    return this.prisma.auctionBreak.create({ data });
  }

  async getActiveBreak(auctionId: string) {
    return this.prisma.auctionBreak.findFirst({
      where: { auctionId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getBreakById(breakId: string) {
    return this.prisma.auctionBreak.findUnique({
      where: { id: breakId },
    });
  }

  async updateBreak(breakId: string, data: any) {
    return this.prisma.auctionBreak.update({
      where: { id: breakId },
      data,
    });
  }

  async recordSquadViolation(data: any) {
    return this.prisma.squadViolation.create({ data });
  }

  async getSquadViolations(auctionTeamId: string) {
    return this.prisma.squadViolation.findMany({
      where: { auctionTeamId },
      include: { squadRule: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordSquadValidation(data: any) {
    return this.prisma.squadValidation.create({ data });
  }

  async getLatestSquadValidation(auctionId: string, auctionTeamId: string) {
    return this.prisma.squadValidation.findFirst({
      where: { auctionId, auctionTeamId },
      orderBy: { createdAt: 'desc' },
      include: {
        violations: { include: { squadRule: true } },
      },
    });
  }

  async recordConnection(data: any) {
    return this.prisma.auctionParticipantConnection.create({ data });
  }

  async getLatestConnection(auctionId: string, userId: string) {
    return this.prisma.auctionParticipantConnection.findFirst({
      where: { auctionId, userId },
      orderBy: { connectedAt: 'desc' },
    });
  }

  async getAuctionIncrementBrackets(auctionId: string) {
    return this.prisma.auctionIncrementBracket.findMany({
      where: { auctionId },
      orderBy: { fromAmountMinor: 'asc' },
    });
  }

  async getRoomMember(roomId: string, userId: string) {
    return this.prisma.roomMember.findFirst({
      where: { roomId, userId },
    });
  }

  async getAuctionPlayerById(auctionPlayerId: string) {
    return this.prisma.auctionPlayer.findUnique({
      where: { id: auctionPlayerId },
    });
  }

  async getRecentAuctionEvents(roomId: string, limit: number = 10) {
    // Get auction for room, then get recent events
    const auction = await this.prisma.auction.findUnique({
      where: { roomId },
    });

    if (!auction) {
      return [];
    }

    return this.prisma.auctionEvent.findMany({
      where: { auctionId: auction.id },
      orderBy: { sequence: 'desc' },
      take: limit,
    });
  }

  // Transactional operations
  async withTransaction<T>(fn: (prisma: PrismaService) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      return fn(tx as any);
    });
  }
}
