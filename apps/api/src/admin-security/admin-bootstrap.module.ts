import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import type { RuntimeConfig } from '../config/runtime-config';
import { loadRuntimeConfig } from '../config/runtime-config';
import { DatabaseModule } from '../database/database.module';
import { AdminBootstrapCommand } from './admin-bootstrap.command';
import {
  ADMIN_PASSWORD_COMPROMISE_PORT,
  type AdminPasswordCompromisePort,
  UnavailableAdminPasswordCompromisePort,
} from './admin-password-compromise.port';
import { AdminSecurityRepository } from './admin-security.repository';

export interface AdminBootstrapModuleOptions {
  readonly passwordCompromisePort?: AdminPasswordCompromisePort;
}

@Module({})
export class AdminBootstrapModule {
  static register(options: AdminBootstrapModuleOptions = {}): DynamicModule {
    const passwordCompromise: Provider = {
      inject: [ConfigService],
      provide: ADMIN_PASSWORD_COMPROMISE_PORT,
      useFactory: (config: ConfigService<RuntimeConfig, true>) => {
        if (
          options.passwordCompromisePort !== undefined &&
          config.get('environment', { infer: true }) !== 'test'
        ) {
          throw new Error('C2a bootstrap password-compromise adapters are test-only.');
        }
        return options.passwordCompromisePort ?? new UnavailableAdminPasswordCompromisePort();
      },
    };
    return {
      exports: [AdminBootstrapCommand],
      imports: [
        ConfigModule.forRoot({ cache: true, isGlobal: true, validate: loadRuntimeConfig }),
        DatabaseModule.register(),
        AdminAuthModule.register(),
      ],
      module: AdminBootstrapModule,
      providers: [passwordCompromise, AdminSecurityRepository, AdminBootstrapCommand],
    };
  }
}
