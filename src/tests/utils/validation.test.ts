import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { ensureValid, formatIssues, validateSchema } from '../../utils/validation';
import { ValidationError } from '../../services/errors';

describe('validation utilities', () => {
  const schema = z.object({
    id: z.string().uuid(),
    count: z.number().int().positive(),
  });

  it('formats issues with dot-notated paths', () => {
    const issues = [
      {
        code: 'invalid_type',
        message: 'Expected string',
        path: ['user', 'email'],
      },
    ];

    const formatted = formatIssues(issues as any);

    expect(formatted).toEqual([
      {
        code: 'invalid_type',
        message: 'Expected string',
        path: 'user.email',
      },
    ]);
  });

  it('validates schema and returns data when successful', () => {
    const data = {
      id: '5cba5bdb-6ce6-4a1c-bb2e-0f342a641c8f',
      count: 42,
    };

    const result = validateSchema(schema, data);

    expect(result).toEqual({
      success: true,
      data,
    });
  });

  it('returns formatted errors when validation fails', () => {
    const result = validateSchema(schema, { id: 'invalid', count: -1 });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'id' }),
        expect.objectContaining({ path: 'count' }),
      ])
    );
  });

  it('ensureValid throws ValidationError with formatted issues', () => {
    const invalid = { id: 'not-uuid', count: 0 };

    expect(() => ensureValid(schema, invalid, 'Invalid input')).toThrowError(ValidationError);

    try {
      ensureValid(schema, invalid, 'Invalid input');
    } catch (error) {
      if (error instanceof ValidationError) {
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.statusCode).toBe(400);
        expect(error.details?.errors).toBeDefined();
      } else {
        throw error;
      }
    }
  });
});
