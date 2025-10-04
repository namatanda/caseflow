import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
    ApiError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    errorHandler
} from '@/middleware/errorHandler';

// Mock logger
vi.mock('@/utils/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    }
}));

// Mock Prisma
const mockPrismaClientKnownRequestError = class extends Error {
    code: string;
    constructor(message: string, code: string) {
        super(message);
        this.code = code;
        this.name = 'PrismaClientKnownRequestError';
    }
};

const mockPrismaClientValidationError = class extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PrismaClientValidationError';
    }
};

vi.mock('@prisma/client', () => ({
    Prisma: {
        PrismaClientKnownRequestError: mockPrismaClientKnownRequestError,
        PrismaClientValidationError: mockPrismaClientValidationError
    }
}));

// Make Prisma available globally for the error handler
global.Prisma = {
    PrismaClientKnownRequestError: mockPrismaClientKnownRequestError,
    PrismaClientValidationError: mockPrismaClientValidationError
};

describe('Error Handler Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockRequest = {
            url: '/test',
            method: 'GET',
            ip: '127.0.0.1',
            get: vi.fn().mockReturnValue('test-user-agent'),
        };

        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };

        mockNext = vi.fn();
    });

    describe('Custom Error Classes', () => {
        it('should create ApiError with correct properties', () => {
            const error = new ApiError('Test error', 400);

            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(400);
            expect(error.isOperational).toBe(true);
            expect(error.errorId).toBeDefined();
            expect(error.errorId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });

        it('should create ValidationError with 400 status', () => {
            const error = new ValidationError('Validation failed');

            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Validation failed');
            expect(error.name).toBe('ValidationError');
        });

        it('should create AuthenticationError with 401 status', () => {
            const error = new AuthenticationError();

            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Authentication required');
            expect(error.name).toBe('AuthenticationError');
        });

        it('should create AuthorizationError with 403 status', () => {
            const error = new AuthorizationError();

            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('Insufficient permissions');
            expect(error.name).toBe('AuthorizationError');
        });

        it('should create NotFoundError with 404 status', () => {
            const error = new NotFoundError();

            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Resource not found');
            expect(error.name).toBe('NotFoundError');
        });

        it('should create ConflictError with 409 status', () => {
            const error = new ConflictError();

            expect(error.statusCode).toBe(409);
            expect(error.message).toBe('Resource conflict');
            expect(error.name).toBe('ConflictError');
        });

        it('should create RateLimitError with 429 status', () => {
            const error = new RateLimitError();

            expect(error.statusCode).toBe(429);
            expect(error.message).toBe('Too many requests');
            expect(error.name).toBe('RateLimitError');
        });
    });

    describe('Error Handler Function', () => {
        it('should handle ApiError correctly', () => {
            const error = new ApiError('Test API error', 400);

            errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Test API error',
                    errorId: error.errorId,
                    timestamp: expect.any(String),
                })
            );
        });

        it('should handle ZodError and convert to ValidationError', () => {
            const zodError = new ZodError([
                {
                    code: 'invalid_type',
                    expected: 'string',
                    received: 'number',
                    path: ['field'],
                    message: 'Expected string, received number'
                }
            ]);

            errorHandler(zodError, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.stringContaining('Validation failed'),
                    errorId: expect.any(String),
                })
            );
        });

        it('should handle unknown errors and convert to ApiError', () => {
            const unknownError = new Error('Unknown error');

            errorHandler(unknownError, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: 'Internal server error',
                    errorId: expect.any(String),
                })
            );
        });

        it('should include stack trace in development environment', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const error = new ApiError('Test error', 400);

            errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    stack: expect.any(String),
                })
            );

            process.env.NODE_ENV = originalEnv;
        });

        it('should not include stack trace in production environment', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const error = new ApiError('Test error', 400);

            errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

            const jsonCall = (mockResponse.json as any).mock.calls[0][0];
            expect(jsonCall).not.toHaveProperty('stack');

            process.env.NODE_ENV = originalEnv;
        });
    });
});