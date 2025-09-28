import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/database', () => ({
  withTransaction: vi.fn(),
}));

import { BaseRepository, type PrismaCrudDelegate } from '../../repositories/baseRepository';
import { withTransaction } from '../../config/database';

const withTransactionMock = withTransaction as unknown as ReturnType<typeof vi.fn>;

type MockedDelegate = {
  [K in keyof PrismaCrudDelegate]: ReturnType<typeof vi.fn>;
};

const createDelegate = (): MockedDelegate => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
});

describe('BaseRepository', () => {
  const delegate = createDelegate();
  const repository = new BaseRepository(delegate as unknown as PrismaCrudDelegate);

  beforeEach(() => {
    vi.clearAllMocks();
    withTransactionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls findMany with provided arguments', async () => {
    const expected = [{ id: '1' }];
    delegate.findMany.mockResolvedValue(expected);

    const args = { where: { id: '1' } } as any;
    const result = await repository.findMany(args);

    expect(delegate.findMany).toHaveBeenCalledWith(args);
    expect(result).toBe(expected);
  });

  it('applies pagination defaults when not provided', async () => {
    const records = Array.from({ length: 3 }, (_, index) => ({ id: `${index}` }));
    delegate.findMany.mockResolvedValue(records);
    delegate.count.mockResolvedValue(10);

    const result = await repository.findPaginated();

    expect(delegate.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
    expect(result).toEqual({
      data: records,
      total: 10,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    });
  });

  it('applies provided pagination arguments', async () => {
    const records = [{ id: '3' }];
    delegate.findMany.mockResolvedValue(records);
    delegate.count.mockResolvedValue(6);

    const args = { where: { status: 'ACTIVE' } } as any;

    const result = await repository.findPaginated({ args, page: 2, pageSize: 2 });

    expect(delegate.findMany).toHaveBeenCalledWith({
      ...args,
      skip: 2,
      take: 2,
    });
    expect(delegate.count).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({
      data: records,
      total: 6,
      page: 2,
      pageSize: 2,
      pageCount: 3,
    });
  });

  it('runs operations within a transaction', async () => {
    const transactionFn = vi.fn().mockResolvedValue('result');
    const transactionClient = { prisma: true } as any;

    withTransactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(transactionClient));

    const result = await repository.transaction(transactionFn);

    expect(withTransactionMock).toHaveBeenCalledTimes(1);
    expect(transactionFn).toHaveBeenCalledWith(transactionClient);
    expect(result).toBe('result');
  });
});
