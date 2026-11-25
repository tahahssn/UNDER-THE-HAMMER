import { Module } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsRepository } from './auctions.repository';
import { AuctionsController } from './auctions.controller';
import { AuctionStateMachineService } from './services/auction-state-machine.service';
import { AuctionConfigurationService } from './services/auction-configuration.service';
import { BidValidationService } from './services/bid-validation.service';
import { BidAcceptanceService } from './services/bid-acceptance.service';
import { PurseLedgerService } from './services/purse-ledger.service';
import { SettlementService } from './services/settlement.service';
import { PlayerSelectionService } from './services/player-selection.service';
import { AuctionEventBroadcasterService } from './services/auction-event-broadcaster.service';
import { AuctionEventStoreService } from './services/auction-event-store.service';
import { AuctionSnapshotService } from './services/auction-snapshot.service';
import { BreakManagerService } from './services/break-manager.service';
import { SquadValidatorService } from './services/squad-validator.service';
import { SquadsService } from './services/squads.service';
import { CountdownService } from './services/countdown.service';
import { TurnBasedEngineService } from './services/turn-based-engine.service';
import { AuctionRoomGateway } from './gateways/auction-room.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuctionsController],
  providers: [
    AuctionsService,
    AuctionsRepository,
    AuctionStateMachineService,
    AuctionConfigurationService,
    BidValidationService,
    BidAcceptanceService,
    PurseLedgerService,
    SettlementService,
    PlayerSelectionService,
    AuctionEventBroadcasterService,
    AuctionEventStoreService,
    AuctionSnapshotService,
    BreakManagerService,
    SquadValidatorService,
    SquadsService,
    CountdownService,
    TurnBasedEngineService,
    AuctionRoomGateway,
  ],
  exports: [AuctionsService, AuctionEventBroadcasterService],
})
export class AuctionsModule {}
