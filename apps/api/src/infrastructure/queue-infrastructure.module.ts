import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from '../config/runtime-config';
import { redisConnectionOptions } from './redis-connection-options';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeConfig, true>) => ({
        connection: redisConnectionOptions(config),
      }),
    }),
  ],
})
export class QueueInfrastructureModule {}
