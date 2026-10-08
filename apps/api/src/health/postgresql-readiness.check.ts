import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AdminWriterService } from '../database/admin-writer.service';
import type { ReadinessCheck } from './readiness-check';

@Injectable()
export class PostgresqlReadinessCheck implements ReadinessCheck {
  readonly name = 'postgresql' as const;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminWriterService) private readonly adminWriter: AdminWriterService,
  ) {}

  async check(): Promise<void> {
    await Promise.all([this.prisma.selectOne(), this.adminWriter.selectOne()]);
  }
}
