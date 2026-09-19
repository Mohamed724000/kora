import type { PrismaService } from '../database/prisma.service';
import { PostgresqlReadinessCheck } from './postgresql-readiness.check';

function createPrismaService(): PrismaService {
  return {
    selectOne: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  } as unknown as PrismaService;
}

describe('PostgresqlReadinessCheck', () => {
  let prisma: PrismaService;
  let readinessCheck: PostgresqlReadinessCheck;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaService();
    readinessCheck = new PostgresqlReadinessCheck(prisma);
  });

  it('réutilise le client Prisma runtime pour SELECT 1', async () => {
    await readinessCheck.check();
    await readinessCheck.check();

    expect(prisma.selectOne).toHaveBeenCalledTimes(2);
  });

  it('propage toujours un échec de requête au mécanisme de readiness', async () => {
    const queryError = new Error('controlled query failure');
    jest.mocked(prisma.selectOne).mockRejectedValue(queryError);

    await expect(readinessCheck.check()).rejects.toBe(queryError);
  });
});
