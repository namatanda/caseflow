import { describe, it, expect } from 'vitest';

import { chunkArray } from '@/utils/chunk';

describe('chunkArray', () => {
  it('splits an array into evenly sized chunks', () => {
    const items = [1, 2, 3, 4, 5];

    const chunks = chunkArray(items, 2);

    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns an empty array when the input is empty', () => {
    const chunks = chunkArray([], 3);

    expect(chunks).toEqual([]);
  });

  it('throws when chunk size is zero or negative', () => {
    expect(() => chunkArray([1, 2, 3], 0)).toThrow('Chunk size must be greater than zero');
    expect(() => chunkArray([1, 2, 3], -1)).toThrow('Chunk size must be greater than zero');
  });
});
