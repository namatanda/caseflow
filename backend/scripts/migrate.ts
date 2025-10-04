#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { logger } from '../src/utils/logger';
import { config } from '../src/config/environment';
import { checkDatabaseConnection, connectWithRetry } from '../src/config/database';

interface MigrationOptions {
  environment: 'development' | 'staging' | 'production';
  dryRun?: boolean;
  force?: boolean;
  reset?: boolean;
}

class DatabaseMigrator {
  private environment: string;
  private dryRun: boolean;
  private force: boolean;
  private reset: boolean;

  constructor(options: MigrationOptions) {
    this.environment = options.environment;
    this.dryRun = options.dryRun || false;
    this.force = options.force || false;
    this.reset = options.reset || false;
  }

  async migrate(): Promise<void> {
    try {
      logger.info(`Starting database migration for ${this.environment} environment`);

      // Check database connection
      const connectionCheck = await checkDatabaseConnection();
      if (!connectionCheck.isHealthy) {
        logger.error('Database connection failed:', connectionCheck.details);
        
        // Try to connect with retry
        const connected = await connectWithRetry(5, 2000);
        if (!connected) {
          throw new Error('Unable to establish database connection');
        }
      }

      // Backup database in production
      if (this.environment === 'production' && !this.dryRun) {
        await this.createBackup();
      }

      // Reset database if requested
      if (this.reset) {
        await this.resetDatabase();
      }

      // Run migrations
      await this.runMigrations();

      // Generate Prisma client
      await this.generateClient();

      // Verify migration success
      await this.verifyMigration();

      logger.info('Database migration completed successfully');
    } catch (error) {
      logger.error('Database migration failed:', error);
      
      // Rollback in production if migration fails
      if (this.environment === 'production' && !this.dryRun) {
        await this.rollback();
      }
      
      throw error;
    }
  }

  private async createBackup(): Promise<void> {
    try {
      logger.info('Creating database backup...');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = `backup-${this.environment}-${timestamp}.sql`;
      
      const command = `pg_dump "${config.database.url}" > backups/${backupFile}`;
      
      if (this.dryRun) {
        logger.info(`[DRY RUN] Would create backup: ${command}`);
        return;
      }

      execSync(command, { stdio: 'inherit' });
      logger.info(`Database backup created: ${backupFile}`);
    } catch (error) {
      logger.error('Failed to create database backup:', error);
      throw error;
    }
  }

  private async resetDatabase(): Promise<void> {
    try {
      logger.info('Resetting database...');
      
      const command = 'npx prisma migrate reset --force --skip-generate';
      
      if (this.dryRun) {
        logger.info(`[DRY RUN] Would reset database: ${command}`);
        return;
      }

      if (!this.force && this.environment === 'production') {
        throw new Error('Database reset not allowed in production without --force flag');
      }

      execSync(command, { stdio: 'inherit', cwd: process.cwd() });
      logger.info('Database reset completed');
    } catch (error) {
      logger.error('Failed to reset database:', error);
      throw error;
    }
  }

  private async runMigrations(): Promise<void> {
    try {
      logger.info('Running database migrations...');
      
      let command: string;
      
      if (this.environment === 'production') {
        command = 'npx prisma migrate deploy';
      } else {
        command = 'npx prisma migrate dev --skip-generate';
      }
      
      if (this.dryRun) {
        logger.info(`[DRY RUN] Would run migrations: ${command}`);
        return;
      }

      execSync(command, { stdio: 'inherit', cwd: process.cwd() });
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Failed to run database migrations:', error);
      throw error;
    }
  }

  private async generateClient(): Promise<void> {
    try {
      logger.info('Generating Prisma client...');
      
      const command = 'npx prisma generate';
      
      if (this.dryRun) {
        logger.info(`[DRY RUN] Would generate client: ${command}`);
        return;
      }

      execSync(command, { stdio: 'inherit', cwd: process.cwd() });
      logger.info('Prisma client generated');
    } catch (error) {
      logger.error('Failed to generate Prisma client:', error);
      throw error;
    }
  }

  private async verifyMigration(): Promise<void> {
    try {
      logger.info('Verifying migration...');
      
      const connectionCheck = await checkDatabaseConnection();
      if (!connectionCheck.isHealthy) {
        throw new Error('Database connection verification failed');
      }

      // Additional verification queries can be added here
      logger.info('Migration verification completed');
    } catch (error) {
      logger.error('Migration verification failed:', error);
      throw error;
    }
  }

  private async rollback(): Promise<void> {
    try {
      logger.warn('Attempting to rollback migration...');
      
      // In a real scenario, you would implement proper rollback logic
      // This might involve restoring from backup or running rollback migrations
      logger.warn('Rollback functionality not implemented - manual intervention required');
    } catch (error) {
      logger.error('Rollback failed:', error);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const environment = (args[0] as 'development' | 'staging' | 'production') || 'development';
  
  const options: MigrationOptions = {
    environment,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    reset: args.includes('--reset'),
  };

  if (!['development', 'staging', 'production'].includes(environment)) {
    logger.error('Invalid environment. Use: development, staging, or production');
    process.exit(1);
  }

  const migrator = new DatabaseMigrator(options);
  
  try {
    await migrator.migrate();
    process.exit(0);
  } catch (error) {
    logger.error('Migration script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { DatabaseMigrator };