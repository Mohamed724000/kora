import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadRuntimeConfig } from '../config/runtime-config';
import { DatabaseModule } from '../database/database.module';
import { AdminSecurityRepository } from './admin-security.repository';
import { AdminRecoveryExpirationWorker } from './admin-recovery-expiration.worker';

@Module({
  exports: [AdminRecoveryExpirationWorker],
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, validate: loadRuntimeConfig }),
    DatabaseModule.register(),
  ],
  providers: [AdminSecurityRepository, AdminRecoveryExpirationWorker],
})
export class AdminRecoveryExpirationModule {}
