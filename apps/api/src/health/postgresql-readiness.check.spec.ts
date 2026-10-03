import type { PrismaService } from '../database/prisma.service';
import type { AdminWriterService } from '../database/admin-writer.service';
import { PostgresqlReadinessCheck } from './postgresql-readiness.check';

function createPrismaService(): PrismaService {
  return {
    selectOne: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  } as unknown as PrismaService;
}

function createAdminWriterService(): AdminWriterService {
  return {
    selectOne: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  } as unknown as AdminWriterService;
}

describe('PostgresqlReadinessCheck', () => {
  let prisma: PrismaService;
  let writer: AdminWriterService;
  let readinessCheck: PostgresqlReadinessCheck;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaService();
    writer = createAdminWriterService();
    readinessCheck = new PostgresqlReadinessCheck(prisma, writer);
  });

  it('réutilise le client Prisma runtime pour SELECT 1', async () => {
    await readinessCheck.check();
    await readinessCheck.check();

    expect(prisma.selectOne).toHaveBeenCalledTimes(2);
    expect(writer.selectOne).toHaveBeenCalledTimes(2);
  });

  it('propage toujours un échec de requête au mécanisme de readiness', async () => {
    const queryError = new Error('controlled query failure');
    jest.mocked(prisma.selectOne).mockRejectedValue(queryError);

    await expect(readinessCheck.check()).rejects.toBe(queryError);
  });

  it('propage un échec du writer sous la dépendance PostgreSQL existante', async () => {
    const queryError = new Error('controlled writer failure');
    jest.mocked(writer.selectOne).mockRejectedValue(queryError);
    await expect(readinessCheck.check()).rejects.toBe(queryError);
  });
});
