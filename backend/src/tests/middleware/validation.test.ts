import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { validateRequest, validateBody, validateQuery, validateParams, validateResponse } from '../../middleware/validation';
import { z } from 'zod';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock ApiError
vi.mock('../../utils/errors', () => ({
  ApiError: class ApiError extends Error {
    statusCode: number;
    isOperational: boolean;
    constructor(statusCode: number, message: string, isOperational = true) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = isOperational;
    }
  },
}));

describe('Validation Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('validateBody', () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
      email: z.string().email(),
    });

    it('should pass validation with valid body', () => {
      mockReq.body = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const middleware = validateBody(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.body).toEqual({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      });
    });

    it('should fail validation with invalid body', () => {
      mockReq.body = {
        name: '',
        age: -5,
        email: 'invalid-email',
      };

      const middleware = validateBody(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(400);
    });

    it('should coerce types when possible', () => {
      const flexibleSchema = z.object({
        count: z.coerce.number(),
        active: z.coerce.boolean(),
      });

      mockReq.body = {
        count: '42',
        active: 'true',
      };

      const middleware = validateBody(flexibleSchema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.body).toEqual({
        count: 42,
        active: true,
      });
    });

    it('should handle missing required fields', () => {
      mockReq.body = {
        name: 'John',
      };

      const middleware = validateBody(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.message).toContain('age');
      expect(error.message).toContain('email');
    });

    it('should strip unknown fields when configured', () => {
      const strictSchema = z.object({
        name: z.string(),
      }).strict();

      mockReq.body = {
        name: 'John',
        extraField: 'should be removed',
      };

      const middleware = validateBody(strictSchema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
    });
  });

  describe('validateQuery', () => {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(10),
      search: z.string().optional(),
    });

    it('should validate and coerce query parameters', () => {
      mockReq.query = {
        page: '2',
        limit: '25',
        search: 'test',
      };

      const middleware = validateQuery(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.query).toEqual({
        page: 2,
        limit: 25,
        search: 'test',
      });
    });

    it('should apply defaults for missing query params', () => {
      mockReq.query = {};

      const middleware = validateQuery(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.query).toEqual({
        page: 1,
        limit: 10,
      });
    });

    it('should reject invalid query values', () => {
      mockReq.query = {
        page: '-1',
        limit: '500',
      };

      const middleware = validateQuery(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(400);
    });
  });

  describe('validateParams', () => {
    const schema = z.object({
      id: z.string().uuid(),
      batchId: z.string().regex(/^batch_\d+$/),
    });

    it('should validate URL parameters', () => {
      mockReq.params = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        batchId: 'batch_12345',
      };

      const middleware = validateParams(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should fail on invalid UUID format', () => {
      mockReq.params = {
        id: 'not-a-uuid',
        batchId: 'batch_123',
      };

      const middleware = validateParams(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.message).toContain('id');
    });

    it('should fail on invalid pattern', () => {
      mockReq.params = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        batchId: 'invalid_format',
      };

      const middleware = validateParams(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.message).toContain('batchId');
    });
  });

  describe('validateRequest', () => {
    const schema = z.object({
      body: z.object({
        username: z.string().min(3),
      }),
      query: z.object({
        verbose: z.coerce.boolean().optional(),
      }),
      params: z.object({
        id: z.string().uuid(),
      }),
    });

    it('should validate all request parts simultaneously', () => {
      mockReq.body = { username: 'john_doe' };
      mockReq.query = { verbose: 'true' };
      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.body.username).toBe('john_doe');
      expect(mockReq.query.verbose).toBe(true);
      expect(mockReq.params.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should fail if any part is invalid', () => {
      mockReq.body = { username: 'ab' }; // Too short
      mockReq.query = { verbose: 'true' };
      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.message).toContain('username');
    });

    it('should validate only specified parts', () => {
      const partialSchema = {
        body: z.object({
          data: z.string(),
        }),
      };

      mockReq.body = { data: 'valid' };
      mockReq.query = { anything: 'goes' }; // Not validated
      mockReq.params = { anything: 'goes' }; // Not validated

      const middleware = validateRequest(partialSchema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('validateResponse', () => {
    const schema = z.object({
      success: z.boolean(),
      data: z.array(z.object({
        id: z.string(),
        name: z.string(),
      })),
    });

    it('should validate response data before sending', () => {
      const responseData = {
        success: true,
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
      };

      const originalJson = mockRes.json as ReturnType<typeof vi.fn>;
      const middleware = validateResponse(schema);
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
      
      // Call the wrapped json method
      mockRes.json!(responseData);
      
      expect(originalJson).toHaveBeenCalledWith(responseData);
    });

    it('should reject invalid response data', () => {
      const invalidData = {
        success: 'not a boolean',
        data: 'not an array',
      };

      const middleware = validateResponse(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(() => {
        mockRes.json!(invalidData);
      }).toThrow();
    });

    it('should allow valid responses to pass through', () => {
      const validData = {
        success: false,
        data: [],
      };

      const originalJson = mockRes.json as ReturnType<typeof vi.fn>;
      const middleware = validateResponse(schema);
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      mockRes.json!(validData);

      expect(originalJson).toHaveBeenCalledWith(validData);
    });
  });

  describe('Error handling', () => {
    it('should provide detailed error messages', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18).max(100),
        terms: z.boolean(),
      });

      mockReq.body = {
        email: 'not-an-email',
        age: 15,
        terms: 'yes',
      };

      const middleware = validateBody(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.message).toContain('email');
      expect(error.message).toContain('age');
      expect(error.message).toContain('terms');
    });

    it('should handle unexpected validation errors', () => {
      const faultySchema = z.any().transform(() => {
        throw new Error('Transform error');
      });

      mockReq.body = { anything: 'value' };

      const middleware = validateBody(faultySchema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const error = vi.mocked(mockNext).mock.calls[0][0];
      expect(error).toBeDefined();
    });
  });
});
