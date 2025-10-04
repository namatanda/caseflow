#!/usr/bin/env tsx

import { PrismaClient, CourtType, UserRole, CaseStatus } from '@prisma/client';
import { logger } from '../src/utils/logger';
import { connectWithRetry } from '../src/config/database';

const prisma = new PrismaClient();

interface SeedOptions {
  environment: 'development' | 'staging' | 'production';
  force?: boolean;
}

class DatabaseSeeder {
  private environment: string;
  private force: boolean;

  constructor(options: SeedOptions) {
    this.environment = options.environment;
    this.force = options.force || false;
  }

  async seed(): Promise<void> {
    try {
      logger.info(`Starting database seeding for ${this.environment} environment`);

      // Connect to database
      const connected = await connectWithRetry(5, 2000);
      if (!connected) {
        throw new Error('Unable to establish database connection');
      }

      // Check if database is already seeded
      const existingData = await this.checkExistingData();
      if (existingData && !this.force) {
        logger.info('Database already contains data. Use --force to reseed.');
        return;
      }

      // Clear existing data if force is enabled
      if (this.force) {
        await this.clearData();
      }

      // Seed data based on environment
      await this.seedCourts();
      await this.seedCaseTypes();
      await this.seedJudges();
      await this.seedUsers();

      // Seed sample data for development
      if (this.environment === 'development') {
        await this.seedSampleCases();
      }

      logger.info('Database seeding completed successfully');
    } catch (error) {
      logger.error('Database seeding failed:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  private async checkExistingData(): Promise<boolean> {
    try {
      const [courtCount, userCount, caseTypeCount] = await Promise.all([
        prisma.court.count(),
        prisma.user.count(),
        prisma.caseType.count(),
      ]);

      return courtCount > 0 || userCount > 0 || caseTypeCount > 0;
    } catch (error) {
      logger.error('Failed to check existing data:', error);
      return false;
    }
  }

  private async clearData(): Promise<void> {
    try {
      logger.info('Clearing existing data...');

      // Delete in correct order to respect foreign key constraints
      await prisma.caseActivity.deleteMany();
      await prisma.caseJudgeAssignment.deleteMany();
      await prisma.importErrorDetail.deleteMany();
      await prisma.dailyImportBatch.deleteMany();
      await prisma.case.deleteMany();
      await prisma.caseType.deleteMany();
      await prisma.judge.deleteMany();
      await prisma.court.deleteMany();
      await prisma.user.deleteMany();

      logger.info('Existing data cleared');
    } catch (error) {
      logger.error('Failed to clear existing data:', error);
      throw error;
    }
  }

  private async seedCourts(): Promise<void> {
    try {
      logger.info('Seeding courts...');

      const courts = [
        {
          courtName: 'Supreme Court of Kenya',
          courtCode: 'SC',
          courtType: CourtType.SC,
        },
        {
          courtName: 'Court of Appeal - Nairobi',
          courtCode: 'COA-NBI',
          courtType: CourtType.COA,
        },
        {
          courtName: 'High Court - Nairobi',
          courtCode: 'HC-NBI',
          courtType: CourtType.HC,
        },
        {
          courtName: 'High Court - Mombasa',
          courtCode: 'HC-MSA',
          courtType: CourtType.HC,
        },
        {
          courtName: 'Magistrate Court - Nairobi',
          courtCode: 'MC-NBI',
          courtType: CourtType.MC,
        },
        {
          courtName: 'Magistrate Court - Mombasa',
          courtCode: 'MC-MSA',
          courtType: CourtType.MC,
        },
        {
          courtName: 'Employment and Labour Relations Court - Nairobi',
          courtCode: 'ELC-NBI',
          courtType: CourtType.ELC,
        },
        {
          courtName: 'Environment and Land Court - Nairobi',
          courtCode: 'ELRC-NBI',
          courtType: CourtType.ELRC,
        },
      ];

      await prisma.court.createMany({
        data: courts,
        
      });

      logger.info(`Seeded ${courts.length} courts`);
    } catch (error) {
      logger.error('Failed to seed courts:', error);
      throw error;
    }
  }

  private async seedCaseTypes(): Promise<void> {
    try {
      logger.info('Seeding case types...');

      const caseTypes = [
        {
          caseTypeName: 'Civil Case',
          caseTypeCode: 'CC',
          description: 'Civil litigation cases',
        },
        {
          caseTypeName: 'Criminal Case',
          caseTypeCode: 'CR',
          description: 'Criminal prosecution cases',
        },
        {
          caseTypeName: 'Family Case',
          caseTypeCode: 'FC',
          description: 'Family law matters',
        },
        {
          caseTypeName: 'Commercial Case',
          caseTypeCode: 'COM',
          description: 'Commercial disputes',
        },
        {
          caseTypeName: 'Constitutional Case',
          caseTypeCode: 'CONST',
          description: 'Constitutional matters',
        },
        {
          caseTypeName: 'Employment Case',
          caseTypeCode: 'EMP',
          description: 'Employment and labour disputes',
        },
        {
          caseTypeName: 'Land Case',
          caseTypeCode: 'LAND',
          description: 'Land and property disputes',
        },
        {
          caseTypeName: 'Election Petition',
          caseTypeCode: 'EP',
          description: 'Election-related petitions',
        },
      ];

      await prisma.caseType.createMany({
        data: caseTypes,
        
      });

      logger.info(`Seeded ${caseTypes.length} case types`);
    } catch (error) {
      logger.error('Failed to seed case types:', error);
      throw error;
    }
  }

  private async seedJudges(): Promise<void> {
    try {
      logger.info('Seeding judges...');

      const judges = [
        {
          fullName: 'Hon. Martha Koome',
          firstName: 'Martha',
          lastName: 'Koome',
        },
        {
          fullName: 'Hon. Philomena Mwilu',
          firstName: 'Philomena',
          lastName: 'Mwilu',
        },
        {
          fullName: 'Hon. Isaac Lenaola',
          firstName: 'Isaac',
          lastName: 'Lenaola',
        },
        {
          fullName: 'Hon. Smokin Wanjala',
          firstName: 'Smokin',
          lastName: 'Wanjala',
        },
        {
          fullName: 'Hon. Njoki Ndung\'u',
          firstName: 'Njoki',
          lastName: 'Ndung\'u',
        },
        {
          fullName: 'Hon. William Ouko',
          firstName: 'William',
          lastName: 'Ouko',
        },
        {
          fullName: 'Hon. Mohammed Ibrahim',
          firstName: 'Mohammed',
          lastName: 'Ibrahim',
        },
        {
          fullName: 'Hon. George Oduya',
          firstName: 'George',
          lastName: 'Oduya',
        },
      ];

      await prisma.judge.createMany({
        data: judges,
        
      });

      logger.info(`Seeded ${judges.length} judges`);
    } catch (error) {
      logger.error('Failed to seed judges:', error);
      throw error;
    }
  }

  private async seedUsers(): Promise<void> {
    try {
      logger.info('Seeding users...');

      const users = [
        {
          email: 'admin@courtflow.ke',
          name: 'System Administrator',
          role: UserRole.ADMIN,
        },
        {
          email: 'data.entry@courtflow.ke',
          name: 'Data Entry Clerk',
          role: UserRole.DATA_ENTRY,
        },
        {
          email: 'viewer@courtflow.ke',
          name: 'Report Viewer',
          role: UserRole.VIEWER,
        },
      ];

      // Add development users
      if (this.environment === 'development') {
        users.push(
          {
            email: 'dev.admin@courtflow.ke',
            name: 'Development Admin',
            role: UserRole.ADMIN,
          },
          {
            email: 'test.user@courtflow.ke',
            name: 'Test User',
            role: UserRole.DATA_ENTRY,
          }
        );
      }

      await prisma.user.createMany({
        data: users,
        
      });

      logger.info(`Seeded ${users.length} users`);
    } catch (error) {
      logger.error('Failed to seed users:', error);
      throw error;
    }
  }

  private async seedSampleCases(): Promise<void> {
    try {
      logger.info('Seeding sample cases for development...');

      // Get required data
      const [courts, caseTypes, judges, users] = await Promise.all([
        prisma.court.findMany(),
        prisma.caseType.findMany(),
        prisma.judge.findMany(),
        prisma.user.findMany(),
      ]);

      if (courts.length === 0 || caseTypes.length === 0 || judges.length === 0 || users.length === 0) {
        logger.warn('Missing required data for sample cases');
        return;
      }

      // Create sample cases
      const sampleCases = [];
      for (let i = 1; i <= 50; i++) {
        const court = courts[Math.floor(Math.random() * courts.length)];
        const caseType = caseTypes[Math.floor(Math.random() * caseTypes.length)];
        const filedDate = new Date();
        filedDate.setDate(filedDate.getDate() - Math.floor(Math.random() * 365));

        sampleCases.push({
          caseNumber: `${caseType.caseTypeCode}/${new Date().getFullYear()}/${i.toString().padStart(4, '0')}`,
          courtName: court.courtName,
          originalCourtId: court.id,
          caseTypeId: caseType.id,
          filedDate,
          parties: {
            applicants: [`Applicant ${i}`],
            defendants: [`Defendant ${i}`],
          },
          status: Math.random() > 0.3 ? CaseStatus.ACTIVE : CaseStatus.RESOLVED,
          maleApplicant: Math.floor(Math.random() * 3),
          femaleApplicant: Math.floor(Math.random() * 3),
          maleDefendant: Math.floor(Math.random() * 3),
          femaleDefendant: Math.floor(Math.random() * 3),
        });
      }

      await prisma.case.createMany({
        data: sampleCases,
        
      });

      logger.info(`Seeded ${sampleCases.length} sample cases`);
    } catch (error) {
      logger.error('Failed to seed sample cases:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const environment = (args[0] as 'development' | 'staging' | 'production') || 'development';
  
  const options: SeedOptions = {
    environment,
    force: args.includes('--force'),
  };

  if (!['development', 'staging', 'production'].includes(environment)) {
    logger.error('Invalid environment. Use: development, staging, or production');
    process.exit(1);
  }

  const seeder = new DatabaseSeeder(options);
  
  try {
    await seeder.seed();
    process.exit(0);
  } catch (error) {
    logger.error('Seeding script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { DatabaseSeeder };