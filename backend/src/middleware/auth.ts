import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { logger } from '@/utils/logger';
import { tokenBlacklistService } from '@/services/tokenBlacklistService';
import type { AuthenticatedUser } from '@/types/auth';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  name?: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication middleware that validates JWT tokens
 * Adds user information to request object if token is valid
 */
export const authenticateToken = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        correlationId: req.correlationId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.url,
        method: req.method
      });
      throw new AuthenticationError('Access token required');
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Check if token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      logger.warn('Authentication failed: Token is blacklisted', {
        correlationId: req.correlationId,
        userId: decoded.id,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      throw new AuthenticationError('Token has been revoked');
    }

    // Check if all user tokens are blacklisted (e.g., after password change)
    const areAllUserTokensBlacklisted = await tokenBlacklistService.areAllUserTokensBlacklisted(decoded.id);
    if (areAllUserTokensBlacklisted) {
      logger.warn('Authentication failed: All user tokens are blacklisted', {
        correlationId: req.correlationId,
        userId: decoded.id,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      throw new AuthenticationError('Token has been revoked');
    }

    // Add user information to request
    const userInfo: AuthenticatedUser = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    // Only add name if it exists
    if (decoded.name !== undefined) {
      userInfo.name = decoded.name;
    }

    req.user = userInfo;

    logger.debug('Authentication successful', {
      correlationId: req.correlationId,
      userId: decoded.id,
      userEmail: decoded.email,
      userRole: decoded.role
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Authentication failed: Invalid token', {
        correlationId: req.correlationId,
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next(new AuthenticationError('Invalid or expired token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Authentication failed: Token expired', {
        correlationId: req.correlationId,
        expiredAt: error.expiredAt,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next(new AuthenticationError('Token has expired'));
    } else if (error instanceof AuthenticationError) {
      next(error);
    } else {
      logger.error('Authentication failed: Unexpected error', {
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      next(new AuthenticationError('Authentication failed'));
    }
  }
};

/**
 * Optional authentication middleware that doesn't throw errors
 * Adds user information to request if token is valid, but continues if not
 */
export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      const userInfo: AuthenticatedUser = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role
      };
      
      // Only add name if it exists
      if (decoded.name !== undefined) {
        userInfo.name = decoded.name;
      }
      
      req.user = userInfo;
    }
  } catch (error) {
    // Silently ignore authentication errors for optional auth
    logger.debug('Optional authentication failed', {
      correlationId: req.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  next();
};

/**
 * Role-based authorization middleware
 * Requires authentication middleware to be run first
 */
export const requireRole = (allowedRoles: string | string[]) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      logger.warn('Authorization failed: No user in request', {
        correlationId: req.correlationId,
        url: req.url,
        method: req.method
      });
      return next(new AuthenticationError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        correlationId: req.correlationId,
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        url: req.url,
        method: req.method
      });
      return next(new AuthorizationError(`Access denied. Required roles: ${roles.join(', ')}`));
    }

    logger.debug('Authorization successful', {
      correlationId: req.correlationId,
      userId: req.user.id,
      userRole: req.user.role,
      allowedRoles: roles
    });

    next();
  };
};

/**
 * Admin role authorization middleware
 */
export const requireAdmin = requireRole('admin');

/**
 * User or Admin role authorization middleware
 */
export const requireUserOrAdmin = requireRole(['user', 'admin']);

/**
 * Generate JWT token for user
 */
export const generateToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as string | number,
    issuer: 'courtflow-api',
    audience: 'courtflow-client'
  } as jwt.SignOptions);
};

/**
 * Generate refresh token for user
 */
export const generateRefreshToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn as string | number,
    issuer: 'courtflow-api',
    audience: 'courtflow-client'
  } as jwt.SignOptions);
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
};