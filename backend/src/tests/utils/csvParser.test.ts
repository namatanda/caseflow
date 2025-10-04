import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCsvFile, validateCsvStructure, getCsvStats, detectDuplicates } from '../../utils/csvParser';
import { z } from 'zod';
import { createReadStream } from 'fs';

// Mock modules
vi.mock('fs');
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CSV Parser Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCsvFile', () => {
    it('should parse valid CSV file successfully', async () => {
      const mockCsvParser = vi.fn(() => ({
        on: vi.fn(function (event, handler) {
          if (event === 'headers') {
            setTimeout(() => handler(['name', 'age', 'email']), 0);
          } else if (event === 'data') {
            setTimeout(() => {
              handler({ name: 'John', age: '30', email: 'john@example.com' });
              handler({ name: 'Jane', age: '25', email: 'jane@example.com' });
            }, 0);
          } else if (event === 'end') {
            setTimeout(() => handler(), 10);
          }
          return this;
        }),
      }));

      vi.doMock('csv-parser', () => ({ default: mockCsvParser }));

      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['name', 'age', 'email']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                handler({ name: 'John', age: '30', email: 'john@example.com' });
                handler({ name: 'Jane', age: '25', email: 'jane@example.com' });
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await parseCsvFile('/test/data.csv');

      expect(result.data).toHaveLength(2);
      expect(result.successfulRows).toBe(2);
      expect(result.failedRows).toBe(0);
      expect(result.headers).toEqual(['name', 'age', 'email']);
    });

    it('should validate rows with Zod schema', async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.string().regex(/^\d+$/),
        email: z.string().email(),
      });

      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['name', 'age', 'email']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                handler({ name: 'John', age: '30', email: 'john@example.com' });
                handler({ name: '', age: 'invalid', email: 'not-email' }); // Invalid row
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await parseCsvFile('/test/data.csv', {
        validationSchema: schema,
        continueOnError: true,
      });

      expect(result.successfulRows).toBe(1);
      expect(result.failedRows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(2);
    });

    it('should skip empty rows when configured', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['name', 'value']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                handler({ name: 'Item1', value: '100' });
                handler({ name: '', value: '' }); // Empty row
                handler({ name: 'Item2', value: '200' });
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await parseCsvFile('/test/data.csv', { skipEmptyRows: true });

      expect(result.successfulRows).toBe(2);
      expect(result.emptyRowsSkipped).toBe(1);
    });

    it('should respect maxRows limit', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['id']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                handler({ id: '1' });
                handler({ id: '2' });
                handler({ id: '3' });
                handler({ id: '4' });
                handler({ id: '5' });
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
          destroy: vi.fn(),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await parseCsvFile('/test/data.csv', { maxRows: 3 });

      expect(result.data.length).toBeLessThanOrEqual(3);
      expect(result.warnings).toContain('Maximum row limit of 3 reached. Remaining rows not processed.');
    });

    it('should stop on validation error when continueOnError is false', async () => {
      const schema = z.object({
        value: z.string().min(5),
      });

      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['value']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                handler({ value: 'valid value' });
                handler({ value: 'bad' }); // Will fail validation
              }, 0);
            }
            return this;
          }),
          destroy: vi.fn(),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      await expect(
        parseCsvFile('/test/data.csv', {
          validationSchema: schema,
          continueOnError: false,
        })
      ).rejects.toThrow();
    });
  });

  describe('validateCsvStructure', () => {
    it('should validate CSV headers match expected', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['id', 'name', 'email']), 0);
            }
            return this;
          }),
          destroy: vi.fn(),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await validateCsvStructure('/test/data.csv', ['id', 'name', 'email']);

      expect(result.valid).toBe(true);
      expect(result.missingHeaders).toHaveLength(0);
      expect(result.extraHeaders).toHaveLength(0);
    });

    it('should detect missing headers', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['id', 'name']), 0);
            }
            return this;
          }),
          destroy: vi.fn(),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await validateCsvStructure('/test/data.csv', ['id', 'name', 'email', 'phone']);

      expect(result.valid).toBe(false);
      expect(result.missingHeaders).toEqual(['email', 'phone']);
    });

    it('should detect extra headers', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['id', 'name', 'email', 'extra1', 'extra2']), 0);
            }
            return this;
          }),
          destroy: vi.fn(),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await validateCsvStructure('/test/data.csv', ['id', 'name', 'email']);

      expect(result.extraHeaders).toEqual(['extra1', 'extra2']);
    });
  });

  describe('getCsvStats', () => {
    it('should return CSV statistics', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'headers') {
              setTimeout(() => handler(['id', 'value']), 0);
            } else if (event === 'data') {
              setTimeout(() => {
                for (let i = 1; i <= 10; i++) {
                  handler({ id: i.toString(), value: `value${i}` });
                }
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await getCsvStats('/test/data.csv');

      expect(result.rowCount).toBe(10);
      expect(result.headers).toEqual(['id', 'value']);
      expect(result.sampleRows).toHaveLength(5); // Only first 5 rows as samples
    });
  });

  describe('detectDuplicates', () => {
    it('should detect duplicate rows based on unique fields', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'data') {
              setTimeout(() => {
                handler({ id: '1', email: 'test@example.com' });
                handler({ id: '2', email: 'other@example.com' });
                handler({ id: '3', email: 'test@example.com' }); // Duplicate email
                handler({ id: '4', email: 'test@example.com' }); // Another duplicate
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await detectDuplicates('/test/data.csv', ['email']);

      expect(result.duplicates).toHaveLength(2);
      expect(result.duplicates[0].row).toBe(3);
      expect(result.duplicates[0].duplicateOf).toBe(1);
      expect(result.duplicates[1].row).toBe(4);
      expect(result.duplicates[1].duplicateOf).toBe(1);
    });

    it('should handle composite keys for duplicate detection', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'data') {
              setTimeout(() => {
                handler({ firstName: 'John', lastName: 'Doe', email: 'john@example.com' });
                handler({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });
                handler({ firstName: 'John', lastName: 'Doe', email: 'different@example.com' }); // Duplicate name
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await detectDuplicates('/test/data.csv', ['firstName', 'lastName']);

      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].row).toBe(3);
    });

    it('should return empty array when no duplicates found', async () => {
      const mockStream = {
        pipe: vi.fn().mockReturnValue({
          on: vi.fn(function (event, handler) {
            if (event === 'data') {
              setTimeout(() => {
                handler({ id: '1' });
                handler({ id: '2' });
                handler({ id: '3' });
              }, 0);
            } else if (event === 'end') {
              setTimeout(() => handler(), 10);
            }
            return this;
          }),
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await detectDuplicates('/test/data.csv', ['id']);

      expect(result.duplicates).toHaveLength(0);
    });
  });
});
