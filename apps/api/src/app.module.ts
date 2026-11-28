import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PlayersModule } from './players/players.module';
import { PlayerCategoriesModule } from './player-categories/player-categories.module';
import { TeamsModule } from './teams/teams.module';
import { FilesModule } from './files/files.module';
import { AssetModerationModule } from './asset-moderation/asset-moderation.module';
import { PaymentsModule } from './payments/payments.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { RoomsModule } from './rooms/rooms.module';
import { RoomInvitationsModule } from './room-invitations/room-invitations.module';
import { AuctionsModule } from './auctions/auctions.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req, res) => {
          const incoming = req.headers['x-correlation-id'];
          const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
          res.setHeader('x-correlation-id', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PlayersModule,
    PlayerCategoriesModule,
    TeamsModule,
    FilesModule,
    AssetModerationModule,
    PaymentsModule,
    SubscriptionsModule,
    TournamentsModule,
    RoomsModule,
    RoomInvitationsModule,
    AuctionsModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
