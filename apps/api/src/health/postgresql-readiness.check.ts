import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ReadinessCheck } from './readiness-check';

@Injectable()
export class PostgresqlReadinessCheck implements ReadinessCheck {
  readonly name = 'postgresql' as const;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.selectOne();
  }
}
