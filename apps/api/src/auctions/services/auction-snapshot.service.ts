import { Injectable } from '@nestjs/common';
import { AuctionsRepository } from '../auctions.repository';
import { AuctionEventStoreService } from './auction-event-store.service';
import { PurseLedgerService } from './purse-ledger.service';

@Injectable()
export class AuctionSnapshotService {
  constructor(
    private readonly repo: AuctionsRepository,
    private readonly eventStore: AuctionEventStoreService,
    private readonly purseLedger: PurseLedgerService
  ) {}

  /**
   * Generate complete snapshot for client reconnection
   * Includes: auction state, current player, bids, purse balances, acquisitions, teams, timer
   */
  async generateSnapshot(auctionId: string, userId: string, role: 'HOST' | 'PARTICIPANT' | 'SPECTATOR') {
    const auction = await this.repo.getAuctionById(auctionId);

    if (!auction) {
      return null;
    }

    // Get all recent events
    const events = await this.eventStore.getAllEvents(auctionId);

    // Get teams with balances
    const teams = await this.repo.getAuctionTeams(auctionId);

    const teamsWithBalances = await Promise.all(
      teams.map(async (team: any) => ({
        id: team.id,
        name: team.team?.name,
        purseBalanceMinor: await this.purseLedger.getBalance(team.id),
        purseInitialMinor: team.purseInitialMinor,
        acquisitions: team.acquisitions.map((acq: any) => ({
          id: acq.id,
          playerId: acq.auctionPlayerId,
          playerName: acq.player?.name,
          priceMinor: acq.priceMinor,
        })),
      }))
    );

    // Get current player
    let currentPlayer = null;
    if (auction.currentAuctionPlayerId) {
      const players = await this.repo.getAuctionPlayers(auctionId);
      const current = players.find((p: any) => p.id === auction.currentAuctionPlayerId);
      if (current) {
        currentPlayer = {
          id: current.id,
          name: current.player?.name,
          category: current.player?.category,
          nationality: current.player?.nationality,
        };
      }
    }

    // Build snapshot
    return {
      auctionId,
      phase: auction.phase,
      stateVersion: auction.stateVersion,
      currentPlayerId: auction.currentAuctionPlayerId,
      currentPlayer,
      highBidMinor: auction.highBidMinor,
      highBidTeamId: auction.highBidTeamId,
      phaseDeadline: auction.phaseDeadline,
      teams: teamsWithBalances,
      events: events.map((e: any) => ({
        sequence: e.sequence,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
      timestamp: new Date(),
    };
  }

  /**
   * Generate snapshot with privacy filtering based on role
   */
  async generateSnapshotForRole(auctionId: string, userId: string, role: 'HOST' | 'PARTICIPANT' | 'SPECTATOR') {
    const snapshot = await this.generateSnapshot(auctionId, userId, role);

    if (!snapshot) {
      return null;
    }

    if (role === 'SPECTATOR') {
      // Hide team-specific purse info (show only public summary)
      return {
        ...snapshot,
        teams: snapshot.teams.map((t: any) => ({
          id: t.id,
          name: t.name,
          acquisitions: t.acquisitions,
          // Hide balance for spectators
        })),
      };
    }

    // Participant and Host see full snapshot
    return snapshot;
  }
}
