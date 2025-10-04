import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';

// Mock dependencies
vi.mock('@/repositories/userRepository', () => ({
  userRepository: {
    findByEmailWithPassword: vi.fn(),
    findByIdWithPassword: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/utils/auth', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  validatePasswordStrength: vi.fn(),
  generateToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('@/middleware/auth', () => ({
  generateToken: vi.fn(() => 'mock-access-token'),
  generateRefreshToken: vi.fn(() => 'mock-refresh-token'),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  auditLogger: {
    loginSuccess: vi.fn(),
    loginFailure: vi.fn(),
    logout: vi.fn(),
    passwordChange: vi.fn(),
    registration: vi.fn(),
    tokenRefresh: vi.fn(),
    rateLimitExceeded: vi.fn(),
    unauthorizedAccess: vi.fn(),
    dataImport: vi.fn(),
    dataExport: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/services/userService', () => ({
  UserService: vi.fn().mockImplementation(() => ({
    getByEmail: vi.fn().mockRejectedValue(Object.assign(new Error('User not found'), { name: 'NotFoundError' })),
  })),
}));

vi.mock('@/services/tokenBlacklistService', () => ({
  tokenBlacklistService: {
    blacklistToken: vi.fn().mockResolvedValue(true),
    blacklistAllUserTokens: vi.fn().mockResolvedValue(true),
    isTokenBlacklisted: vi.fn().mockResolvedValue(false),
    areAllUserTokensBlacklisted: vi.fn().mockResolvedValue(false),
  },
}));

// Mock the errors
vi.mock('@/services/errors', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message: string, issues: any[]) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

// Import after mocking
// Update the import path if the file is located at src/services/authService.ts
import { AuthService } from '../../services/authService';
import { userRepository } from '../../repositories/userRepository';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../utils/auth';
import { logger } from '../../utils/logger';
// Import verifyRefreshToken from the correct mock module
import { verifyRefreshToken } from '../../middleware/auth';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService(userRepository);
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.DATA_ENTRY,
        isActive: true,
        password: 'hashed-password',
      };

      vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(mockUser);
      vi.mocked(verifyPassword).mockResolvedValue(true);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        sessionId: expect.any(String),
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
        },
      });

      expect(userRepository.findByEmailWithPassword).toHaveBeenCalledWith('test@example.com');
      expect(verifyPassword).toHaveBeenCalledWith('password123', mockUser.password);
    });

    it('should reject login for inactive user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.DATA_ENTRY,
        isActive: false,
        password: 'hashed-password',
      };

      vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(mockUser);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('Account is deactivated');

      expect(logger.warn).toHaveBeenCalledWith(
        'Login attempt for inactive user',
        { userId: mockUser.id, email: mockUser.email }
      );
    });

    it('should reject login for non-existent user', async () => {
      vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('Invalid email or password');

      expect(logger.warn).toHaveBeenCalledWith(
        'Login attempt for non-existent user',
        { email: 'nonexistent@example.com' }
      );
    });

    it('should reject login with wrong password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.DATA_ENTRY,
        isActive: true,
        password: 'hashed-password',
      };

      vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(mockUser);
      vi.mocked(verifyPassword).mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
      ).rejects.toThrow('Invalid email or password');

      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid password attempt',
        { userId: mockUser.id, email: mockUser.email }
      );
    });
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'newuser@example.com',
        name: 'New User',
        role: UserRole.DATA_ENTRY,
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      vi.mocked(userRepository.findByEmailWithPassword).mockResolvedValue(null);
      vi.mocked(validatePasswordStrength).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(hashPassword).mockResolvedValue('hashed-password');
      vi.mocked(userRepository.create).mockResolvedValue(mockUser);

      const result = await authService.register({
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: 'New User',
      });

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        sessionId: expect.any(String),
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
        },
      });

      expect(userRepository.create).toHaveBeenCalledWith({
        data: {
          email: 'newuser@example.com',
          password: 'hashed-password',
          name: 'New User',
          role: UserRole.DATA_ENTRY,
        },
      });
    });

    it('should reject registration with weak password', async () => {
      vi.mocked(validatePasswordStrength).mockReturnValue({
        isValid: false,
        errors: ['Password too short', 'Missing uppercase letter'],
      });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'weak',
          name: 'Test User',
        })
      ).rejects.toThrow('Password validation failed: Password too short, Missing uppercase letter');
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens successfully', async () => {
      const decodedToken = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.DATA_ENTRY,
        name: 'Test User',
      };

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.DATA_ENTRY,
        isActive: true,
        password: 'hashed-password',
      };

      // Set the mock after beforeEach
      (verifyRefreshToken as any).mockReturnValue(decodedToken);
      vi.mocked(userRepository.findByIdWithPassword).mockResolvedValue(mockUser);

      const result = await authService.refreshToken('refresh-token');

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      expect(userRepository.findByIdWithPassword).toHaveBeenCalledWith(decodedToken.id);
    });

    it('should reject refresh with invalid token', async () => {
      (verifyRefreshToken as any).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken('invalid-token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.DATA_ENTRY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      const result = await authService.getProfile('user-1');

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });

      expect(userRepository.findById).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('should reject profile request for non-existent user', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(authService.getProfile('non-existent')).rejects.toThrow('User not found');
    });
  });

});