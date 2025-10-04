import { describe, it, expect, vi } from 'vitest';

import { CourtRepository } from '../../repositories/courtRepository';

const createDelegate = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
});

describe('CourtRepository', () => {
  it('returns empty results when the search query is blank', async () => {
    const delegate = createDelegate();
  const repository = new CourtRepository(delegate as any);

    const result = await repository.searchByName('   ');

    expect(result).toEqual([]);
    expect(delegate.findMany).not.toHaveBeenCalled();
  });

  it('searches using a trimmed query against names and codes', async () => {
    const delegate = createDelegate();
  const repository = new CourtRepository(delegate as any);
    const expected = [{ id: '1', courtName: 'Central Court' }];
    delegate.findMany.mockResolvedValue(expected);

    const result = await repository.searchByName('  Central  ');

    expect(delegate.findMany).toHaveBeenCalledTimes(1);
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { courtName: { contains: 'Central' } },
          { courtCode: { contains: 'Central' } },
        ],
        isActive: true,
      },
      take: 20,
      orderBy: { courtName: 'asc' },
    });
    expect(result).toBe(expected);
  });
});
