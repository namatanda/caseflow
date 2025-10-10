import crypto from 'crypto';
import { cacheManager } from '@/config/redis';
import { logger } from '@/utils/logger';

export class TokenBlacklistService {
  private readonly blacklistPrefix = 'blacklist:token:';
  private readonly defaultTTL = 86400; // 24 hours - same as refresh token TTL

  /**
   * Add a token to the blacklist
   */
  async blacklistToken(token: string, ttl: number = this.defaultTTL): Promise<boolean> {
    try {
      const key = this.blacklistPrefix + token;
      const result = await cacheManager.set(key, { blacklistedAt: new Date().toISOString() }, ttl);

      if (result) {
        logger.info('Token blacklisted successfully', { tokenHash: this.hashTokenForLogging(token) });
      }

      return result;
    } catch (error) {
      logger.error('Failed to blacklist token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenHash: this.hashTokenForLogging(token)
      });
      return false;
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const key = this.blacklistPrefix + token;
      const result = await cacheManager.get(key);
      return result !== null;
    } catch (error) {
      logger.error('Failed to check token blacklist', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenHash: this.hashTokenForLogging(token)
      });
      // On error, assume token is not blacklisted for safety
      return false;
    }
  }

  /**
   * Remove a token from the blacklist (for testing/admin purposes)
   */
  async removeFromBlacklist(token: string): Promise<boolean> {
    try {
      const key = this.blacklistPrefix + token;
      const result = await cacheManager.del(key);

      if (result) {
        logger.info('Token removed from blacklist', { tokenHash: this.hashTokenForLogging(token) });
      }

      return result;
    } catch (error) {
      logger.error('Failed to remove token from blacklist', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenHash: this.hashTokenForLogging(token)
      });
      return false;
    }
  }

  /**
   * Blacklist all tokens for a user (useful for password changes, account deactivation)
   */
  async blacklistAllUserTokens(userId: string, ttl: number = this.defaultTTL): Promise<boolean> {
    try {
      const key = `blacklist:user:${userId}:all`;
      const result = await cacheManager.set(key, { blacklistedAt: new Date().toISOString() }, ttl);

      if (result) {
        logger.info('All user tokens blacklisted', { userId });
      }

      return result;
    } catch (error) {
      logger.error('Failed to blacklist all user tokens', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return false;
    }
  }

  /**
   * Check if all tokens for a user are blacklisted
   */
  async areAllUserTokensBlacklisted(userId: string): Promise<boolean> {
    try {
      const key = `blacklist:user:${userId}:all`;
      const result = await cacheManager.get(key);
      return result !== null;
    } catch (error) {
      logger.error('Failed to check user token blacklist', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return false;
    }
  }

  /**
   * Create a hash of the token for logging purposes (to avoid logging sensitive token data)
   */
  private hashTokenForLogging(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  /**
   * Clean up expired blacklist entries (Redis TTL should handle this automatically)
   */
  cleanupExpiredTokens(): number {
    // Redis TTL handles cleanup automatically, but this method could be used
    // for manual cleanup or monitoring
    logger.info('Token blacklist cleanup completed (Redis TTL handles expiration)');
    return 0;
  }
}

export const tokenBlacklistService = new TokenBlacklistService();