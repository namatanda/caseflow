import type { Request, Response, NextFunction } from 'express';
import { AuthService, type LoginCredentials, type RegisterData, type PasswordResetRequest, type PasswordResetData } from '@/services/authService';
import { logger } from '@/utils/logger';

interface LoginRequestBody extends LoginCredentials {}

interface RegisterRequestBody extends RegisterData {}

interface RefreshTokenRequestBody {
  refreshToken: string;
}

interface ChangePasswordRequestBody {
  currentPassword: string;
  newPassword: string;
}

interface RequestPasswordResetRequestBody extends PasswordResetRequest {}

/**
 * Build service context from request
 */
const buildServiceContext = (req: Request): Record<string, unknown> => {
  const context: Record<string, unknown> = {};
  if (req.correlationId) context['correlationId'] = req.correlationId;
  if (req.user?.id) context['userId'] = req.user.id;
  return context;
};

export class AuthController {
  constructor() {}

  /**
   * Login endpoint
   * POST /auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const credentials: LoginCredentials = req.body as LoginRequestBody;

      // Validate required fields
      if (!credentials.email || !credentials.password) {
        res.status(400).json({
          message: 'Email and password are required',
        });
        return;
      }

      // Create service instance with request context
      const service = new AuthService(undefined, undefined, buildServiceContext(req));

      const result = await service.login(credentials);

      logger.info('User logged in successfully', {
        userId: result.user.id,
        email: result.user.email,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      logger.warn('Login failed', {
        email: (req.body as LoginRequestBody).email,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Register endpoint
   * POST /auth/register
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data: RegisterData = req.body as RegisterRequestBody;

      // Validate required fields
      if (!data.email || !data.password || !data.name) {
        res.status(400).json({
          message: 'Email, password, and name are required',
        });
        return;
      }

      // Create service instance with request context
      const service = new AuthService(undefined, undefined, buildServiceContext(req));

      const result = await service.register(data);

      logger.info('User registered successfully', {
        userId: result.user.id,
        email: result.user.email,
        correlationId: req.correlationId,
      });

      res.status(201).json({
        message: 'Registration successful',
        data: result,
      });
    } catch (error) {
      logger.warn('Registration failed', {
        email: (req.body as RegisterRequestBody).email,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Refresh token endpoint
   * POST /auth/refresh
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body as RefreshTokenRequestBody;

      if (!refreshToken) {
        res.status(400).json({
          message: 'Refresh token is required',
        });
        return;
      }

      // Create service instance with request context
      const service = new AuthService(undefined, undefined, buildServiceContext(req));

      const result = await service.refreshToken(refreshToken);

      logger.info('Token refreshed successfully', {
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Token refreshed successfully',
        data: result,
      });
    } catch (error) {
      logger.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Logout endpoint
   * POST /auth/logout
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;

      // Extract access token from Authorization header
      const authHeader = req.headers.authorization;
      const accessToken = authHeader && authHeader.split(' ')[1];

      if (userId) {
        // Create service instance with request context
        const service = new AuthService(undefined, undefined, buildServiceContext(req));

        await service.logout(userId, accessToken);
      }

      logger.info('User logged out', {
        userId,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Logout successful',
      });
    } catch (error) {
      logger.warn('Logout failed', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get current user profile
   * GET /auth/profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          message: 'Authentication required',
        });
        return;
      }

      // Create service instance with request context
      const service = new AuthService(undefined, undefined, buildServiceContext(req));

      const profile = await service.getProfile(userId);

      res.status(200).json({
        message: 'Profile retrieved successfully',
        data: profile,
      });
    } catch (error) {
      logger.error('Get profile failed', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Change password endpoint
   * POST /auth/change-password
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { currentPassword, newPassword } = req.body as ChangePasswordRequestBody;

      if (!userId) {
        res.status(401).json({
          message: 'Authentication required',
        });
        return;
      }

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          message: 'Current password and new password are required',
        });
        return;
      }

      // Create service instance with request context
      const service = new AuthService(undefined, undefined, buildServiceContext(req));

      await service.changePassword(userId, currentPassword, newPassword);

      logger.info('Password changed successfully', {
        userId,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.warn('Password change failed', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Request password reset endpoint
   * POST /auth/forgot-password
   */
  async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email }: { email: string } = req.body;

      if (!email) {
        res.status(400).json({
          message: 'Email is required',
        });
        return;
      }

      // Create service instance with request context
      const service = new AuthService(undefined, undefined, buildServiceContext(req));

      await service.requestPasswordReset({ email });

      logger.info('Password reset requested', {
        email,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (error) {
      logger.warn('Password reset request failed', {
        email: (req.body as RequestPasswordResetRequestBody).email,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Reset password endpoint
   * POST /auth/reset-password
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body as PasswordResetData;

      if (!token || !newPassword) {
        res.status(400).json({
          message: 'Reset token and new password are required',
        });
        return;
      }

      // Create service instance with request context
      const service = new AuthService(undefined, undefined, buildServiceContext(req));

      await service.resetPassword({ token, newPassword });

      logger.info('Password reset successfully', {
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Password reset successfully',
      });
    } catch (error) {
      logger.warn('Password reset failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });
      next(error);
    }
  }
}

export const authController = new AuthController();