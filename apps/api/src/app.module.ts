import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Reuse caller-supplied correlation id or generate one, and echo it back.
        genReqId: (req, res) => {
          const incoming = req.headers['x-correlation-id'];
          const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
          res.setHeader('x-correlation-id', id);
          return id;
        },
        // Never log credentials or tokens.
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
      },
    }),
    // Baseline limit. Sensitive routes (auth, bid, chat, upload) will override with stricter limits.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
