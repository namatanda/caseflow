import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireAdmin,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  JwtPayload
} from '@/middleware/auth';
import { AuthenticationError, AuthorizationError } from '@/middleware/errorHandler';

// Mock dependencies
vi.mock('jsonwebtoken');
vi.mock('@/config/environment', () => ({
  config: {
    jwt: {
      secret: 'test-secret-key-that-is-long-enough',
      expiresIn: '1h',
      refreshExpiresIn: '7d'
    }
  }
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}));

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      correlationId: 'test-correlation-id',
      ip: '127.0.0.1',
      url: '/api/v1/test',
      method: 'GET',
      get: vi.fn()
    };
    mockResponse = {};
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token and add user to request', () => {
      const mockPayload: JwtPayload = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        name: 'Test User'
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      vi.mocked(jwt.verify).mockReturnValue(mockPayload);

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret-key-that-is-long-enough');
      expect(mockRequest.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        name: 'Test User'
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should throw AuthenticationError when no token provided', () => {
      mockRequest.headers = {};

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Access token required'
        })
      );
    });

    it('should throw AuthenticationError when token is invalid', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
      });

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid or expired token'
        })
      );
    });

    it('should throw AuthenticationError when token is expired', () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };

      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token has expired'
        })
      );
    });

    it('should handle malformed authorization header', () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat'
      };

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('optionalAuth', () => {
    it('should add user to request when valid token provided', () => {
      const mockPayload: JwtPayload = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      vi.mocked(jwt.verify).mockReturnValue(mockPayload);

      optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without error when no token provided', () => {
      mockRequest.headers = {};

      optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without error when token is invalid', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
      });

      optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireRole', () => {
    it('should allow access when user has required role', () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      };

      const middleware = requireRole('admin');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access when user has one of multiple required roles', () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      };

      const middleware = requireRole(['user', 'admin']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should throw AuthorizationError when user does not have required role', () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      };

      const middleware = requireRole('admin');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it('should throw AuthenticationError when no user in request', () => {
      mockRequest.user = undefined;

      const middleware = requireRole('admin');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  describe('requireAdmin', () => {
    it('should allow access for admin users', () => {
      mockRequest.user = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin'
      };

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for non-admin users', () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'user'
      };

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });
  });

  describe('Token Generation and Verification', () => {
    beforeEach(() => {
      vi.mocked(jwt.sign).mockReturnValue('generated-token' as any);
      vi.mocked(jwt.verify).mockReturnValue({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user'
      } as any);
    });

    describe('generateToken', () => {
      it('should generate access token with correct payload and options', () => {
        const payload = {
          id: 'user-123',
          email: 'test@example.com',
          role: 'user'
        };

        const token = generateToken(payload);

        expect(jwt.sign).toHaveBeenCalledWith(
          payload,
          'test-secret-key-that-is-long-enough',
          {
            expiresIn: '1h',
            issuer: 'courtflow-api',
            audience: 'courtflow-client'
          }
        );
        expect(token).toBe('generated-token');
      });
    });

    describe('generateRefreshToken', () => {
      it('should generate refresh token with correct payload and options', () => {
        const payload = {
          id: 'user-123',
          email: 'test@example.com',
          role: 'user'
        };

        const token = generateRefreshToken(payload);

        expect(jwt.sign).toHaveBeenCalledWith(
          payload,
          'test-secret-key-that-is-long-enough',
          {
            expiresIn: '7d',
            issuer: 'courtflow-api',
            audience: 'courtflow-client'
          }
        );
        expect(token).toBe('generated-token');
      });
    });

    describe('verifyRefreshToken', () => {
      it('should verify and return refresh token payload', () => {
        const result = verifyRefreshToken('refresh-token');

        expect(jwt.verify).toHaveBeenCalledWith(
          'refresh-token',
          'test-secret-key-that-is-long-enough'
        );
        expect(result).toEqual({
          id: 'user-123',
          email: 'test@example.com',
          role: 'user'
        });
      });
    });
  });
});