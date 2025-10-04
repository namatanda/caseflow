import { UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';

import { UserRepository, userRepository } from '@/repositories/userRepository';
import { hashPassword, verifyPassword, validatePasswordStrength } from '@/utils/auth';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '@/middleware/auth';
import { UserService } from './userService';
import { BaseService, type ServiceContext } from './baseService';
import { UnauthorizedError, ValidationError, NotFoundError } from './errors';
import { logger, auditLogger } from '@/utils/logger';
import { tokenBlacklistService } from './tokenBlacklistService';
import { cacheManager, sessionManager } from '@/config/redis';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

export interface RefreshTokenData {
  accessToken: string;
  refreshToken: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetData {
  token: string;
  newPassword: string;
}

export class AuthService extends BaseService<UserRepository> {
  private readonly userService: UserService;

  constructor(
    repository: UserRepository = userRepository,
    userService: UserService = new UserService(repository),
    context: ServiceContext = {}
  ) {
    super(repository, context);
    this.userService = userService;
  }

  /**
   * Authenticate user with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const { email, password } = credentials;

    try {
      // Find user by email with password
      const user = await this.repository.findByEmailWithPassword(email);

      if (!user) {
        logger.warn('Login attempt for non-existent user', { email });
        auditLogger.loginFailure(email, 'unknown', undefined, 'user_not_found');
        throw new UnauthorizedError('Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        logger.warn('Login attempt for inactive user', { userId: user.id, email });
        auditLogger.loginFailure(email, 'unknown', undefined, 'account_inactive');
        throw new UnauthorizedError('Account is deactivated');
      }

      // Verify password
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const isPasswordValid = await verifyPassword(password, (user as any).password);
      if (!isPasswordValid) {
        logger.warn('Invalid password attempt', { userId: user.id, email });
        auditLogger.loginFailure(email, 'unknown', undefined, 'invalid_password');
        throw new UnauthorizedError('Invalid email or password');
      }

      // Generate tokens
      const accessToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });

      // Create user session
      const sessionId = `session_${user.id}_${Date.now()}`;
      const sessionCreated = await sessionManager.createSession(sessionId, user.id, {
        email: user.email,
        role: user.role,
        name: user.name,
        ip: 'unknown', // Will be set by middleware
        userAgent: 'unknown', // Will be set by middleware
      });

      if (!sessionCreated) {
        logger.warn('Failed to create user session', { userId: user.id });
      }

      logger.info('User logged in successfully', { userId: user.id, email, sessionId });
      auditLogger.loginSuccess(user.id, 'unknown', undefined, this.context.correlationId);

      return {
        accessToken,
        refreshToken,
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error('Login error', { email, error: error instanceof Error ? error.message : 'Unknown error' });
      auditLogger.loginFailure(email, 'unknown', undefined, 'system_error');
      throw new UnauthorizedError('Login failed');
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthTokens> {
    const { email, password, name, role = UserRole.DATA_ENTRY } = data;

    try {
      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new ValidationError(`Password validation failed: ${passwordValidation.errors.join(', ')}`, []);
      }

      // Check if user already exists
      try {
        await this.userService.getByEmail(email);
        throw new ValidationError('User with this email already exists', []);
      } catch (error) {
        // User doesn't exist, which is what we want
        if (!(error instanceof NotFoundError || error instanceof UnauthorizedError || (error as Error).name === 'NotFoundError')) {
          throw error;
        }
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const user = await this.repository.create({ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        data: {
          email,
          password: hashedPassword,
          name,
          role,
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      }); // eslint-disable-line @typescript-eslint/no-unsafe-assignment

      // Generate tokens
      const accessToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });

      // Create user session
      const sessionId = `session_${user.id}_${Date.now()}`;
      const sessionCreated = await sessionManager.createSession(sessionId, user.id, {
        email: user.email,
        role: user.role,
        name: user.name,
        ip: 'unknown', // Will be set by middleware
        userAgent: 'unknown', // Will be set by middleware
      });

      if (!sessionCreated) {
        logger.warn('Failed to create user session during registration', { userId: user.id });
      }

      logger.info('User registered successfully', { userId: user.id, email, sessionId });
      auditLogger.registration(user.id, user.email, 'unknown', this.context.correlationId);

      return {
        accessToken,
        refreshToken,
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error('Registration error', { email, error: error instanceof Error ? error.message : 'Unknown error' });
      throw new ValidationError('Registration failed', []);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenData> {
    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Find user
      const user = await this.repository.findByIdWithPassword(decoded.id);
      if (!user || !user.isActive) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Generate new tokens
      const accessToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });

      const newRefreshToken = generateRefreshToken({
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });

      logger.info('Token refreshed successfully', { userId: user.id });
      auditLogger.tokenRefresh(user.id, 'unknown');

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      logger.warn('Token refresh failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  /**
   * Logout user (invalidate access token)
   * Adds the current access token to blacklist
   */
  async logout(userId: string, accessToken?: string): Promise<void> {
    try {
      // Delete all user sessions
      const sessionsDeleted = await sessionManager.deleteUserSessions(userId);
      if (!sessionsDeleted) {
        logger.warn('Failed to delete user sessions during logout', { userId });
      }

      logger.info('User logged out', { userId });
      auditLogger.logout(userId, 'unknown', undefined, this.context.correlationId);

      // Blacklist the access token if provided (non-blocking)
      if (accessToken) {
        try {
          await tokenBlacklistService.blacklistToken(accessToken);
        } catch (error) {
          logger.warn('Failed to blacklist token during logout', { userId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    } catch (error) {
      logger.error('Logout error', { userId, error: error instanceof Error ? error.message : 'Unknown error' });
      // Don't throw error for logout failures
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      // Find user
      const user = await this.repository.findByIdWithPassword(userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Verify current password
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const isCurrentPasswordValid = await verifyPassword(currentPassword, (user as any).password);
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedError('Current password is incorrect');
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new ValidationError(`New password validation failed: ${passwordValidation.errors.join(', ')}`, []);
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      await this.repository.update({ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        where: { id: userId },
        data: { password: hashedNewPassword } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      }); // eslint-disable-line @typescript-eslint/no-unsafe-assignment

      // Delete all user sessions (force logout from all devices)
      const sessionsDeleted = await sessionManager.deleteUserSessions(userId);
      if (!sessionsDeleted) {
        logger.warn('Failed to delete user sessions after password change', { userId });
      }

      // Blacklist all existing tokens for this user (non-blocking)
      try {
        await tokenBlacklistService.blacklistAllUserTokens(userId);
      } catch (error) {
        logger.warn('Failed to blacklist all user tokens after password change', { userId, error: error instanceof Error ? error.message : 'Unknown error' });
      }

      logger.info('Password changed successfully', { userId });
      auditLogger.passwordChange(userId, 'unknown', undefined, this.context.correlationId);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error('Password change error', { userId, error: error instanceof Error ? error.message : 'Unknown error' });
      throw new ValidationError('Password change failed', []);
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(request: PasswordResetRequest): Promise<void> {
    const { email } = request;

    try {
      // Find user by email
      const user = await this.repository.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists or not for security
        logger.info('Password reset requested for non-existent email', { email });
        return;
      }

      // Generate reset token (store in Redis with expiration)
      const resetToken = randomBytes(32).toString('hex');
      const resetKey = `password_reset:${resetToken}`;

      // Store token with user ID and expiration (15 minutes)
      await cacheManager.set(resetKey, { userId: user.id }, 15 * 60);

      // TODO: Send email with reset token
      // For now, just log it (in production, this would send an email)
      logger.info('Password reset token generated', {
        userId: user.id,
        email,
        resetToken,
        expiresIn: '15 minutes'
      });

      auditLogger.passwordReset(user.id, 'unknown', undefined, this.context.correlationId);
    } catch (error) {
      logger.error('Password reset request error', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new ValidationError('Failed to process password reset request', []);
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(data: PasswordResetData): Promise<void> {
    const { token, newPassword } = data;

    try {
      // Get reset data from cache
      const resetKey = `password_reset:${token}`;
      const resetData = await cacheManager.get<{ userId: string }>(resetKey);

      if (!resetData) {
        throw new ValidationError('Invalid or expired reset token', []);
      }

      // Find user
      const user = await this.repository.findByIdWithPassword(resetData.userId);
      if (!user) {
        throw new ValidationError('User not found', []);
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new ValidationError(`New password validation failed: ${passwordValidation.errors.join(', ')}`, []);
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      await this.repository.update({ // eslint-disable-line @typescript-eslint/no-unsafe-assignment
        where: { id: user.id },
        data: { password: hashedNewPassword } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      }); // eslint-disable-line @typescript-eslint/no-unsafe-assignment

      // Delete all user sessions (force logout from all devices)
      const sessionsDeleted = await sessionManager.deleteUserSessions(user.id);
      if (!sessionsDeleted) {
        logger.warn('Failed to delete user sessions after password reset', { userId: user.id });
      }

      // Delete the reset token
      await cacheManager.del(resetKey);

      // Blacklist all existing tokens for this user (non-blocking)
      try {
        await tokenBlacklistService.blacklistAllUserTokens(user.id);
      } catch (error) {
        logger.warn('Failed to blacklist all user tokens after password reset', {
          userId: user.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      logger.info('Password reset successfully', { userId: user.id });
      auditLogger.passwordReset(user.id, 'unknown', undefined, this.context.correlationId);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      logger.error('Password reset error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new ValidationError('Failed to reset password', []);
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string) {
    try {
      const user = await this.repository.findById({ where: { id: userId } });
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Return user without password
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return
      const { password, ...profile } = user as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      return profile; // eslint-disable-line @typescript-eslint/no-unsafe-return
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error('Get profile error', { userId, error: error instanceof Error ? error.message : 'Unknown error' });
      throw new UnauthorizedError('Failed to get user profile');
    }
  }
}

export const authService = new AuthService();