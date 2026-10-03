import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from '../config/runtime-config';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthRepository } from './admin-auth.repository';
import { ADMIN_AUTH_CRYPTO, AdminAuthCrypto } from './admin-auth.crypto';
import {
  ADMIN_KEY_PROVIDER,
  type AdminKeyProvider,
  TestEphemeralAdminKeyProvider,
  UnavailableAdminKeyProvider,
} from './admin-key-provider';
import { ADMIN_RATE_LIMITER, AdminRateLimitService } from './admin-rate-limit.service';
import { ADMIN_REQUEST_POLICY, AdminRequestPolicy } from './admin-request-policy';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionService } from './admin-session.service';

export interface AdminAuthModuleOptions {
  /** Explicit harness injection only. No environment value resolves a provider. */
  keyProvider?: AdminKeyProvider;
}

@Module({})
export class AdminAuthModule {
  static register(options: AdminAuthModuleOptions = {}): DynamicModule {
    const keyProvider: Provider = {
      inject: [ConfigService],
      provide: ADMIN_KEY_PROVIDER,
      useFactory: (config: ConfigService<RuntimeConfig, true>): AdminKeyProvider => {
        const selected = options.keyProvider ?? new UnavailableAdminKeyProvider();
        const environment = config.get('environment', { infer: true });
        if (selected instanceof TestEphemeralAdminKeyProvider && environment !== 'test') {
          throw new Error('TEST_EPHEMERAL admin key provider is restricted to test harnesses.');
        }
        return selected;
      },
    };
    const crypto: Provider = {
      inject: [ADMIN_KEY_PROVIDER],
      provide: ADMIN_AUTH_CRYPTO,
      useFactory: (provider: AdminKeyProvider) => new AdminAuthCrypto(provider),
    };
    const requestPolicy: Provider = {
      inject: [ConfigService, ADMIN_KEY_PROVIDER],
      provide: ADMIN_REQUEST_POLICY,
      useFactory: (config: ConfigService<RuntimeConfig, true>, provider: AdminKeyProvider) =>
        new AdminRequestPolicy({
          keyProvider: provider,
          origin: config.get('adminAuth', { infer: true }).origin,
        }),
    };
    const rateLimiter: Provider = {
      inject: [ConfigService, ADMIN_KEY_PROVIDER],
      provide: ADMIN_RATE_LIMITER,
      useFactory: (config: ConfigService<RuntimeConfig, true>, provider: AdminKeyProvider) => {
        const adminAuth = config.get('adminAuth', { infer: true });
        const readiness = config.get('readiness', { infer: true });
        return new AdminRateLimitService({
          commandTimeoutMs: readiness.timeoutMs,
          keyProvider: provider,
          redis: adminAuth.redis,
        });
      },
    };

    return {
      controllers: [AdminAuthController],
      exports: [AdminAuthService, AdminSessionService, ADMIN_KEY_PROVIDER],
      module: AdminAuthModule,
      providers: [
        keyProvider,
        crypto,
        requestPolicy,
        rateLimiter,
        AdminAuthRepository,
        AdminSessionService,
        AdminAuthService,
      ],
    };
  }
}
