import type { Prisma, CourtType } from '@prisma/client';
import { CaseStatus, ImportStatus } from '@prisma/client';
import { csvImportQueue } from '@/config/queue';
import type { CsvImportJobData } from '@/workers/csvImportWorker';

import {
  dailyImportBatchRepository,
  DailyImportBatchRepository,
} from '@/repositories/dailyImportBatchRepository';
import {
  caseTypeRepository as defaultCaseTypeRepository,
  CaseTypeRepository,
} from '@/repositories/caseTypeRepository';
import {
  courtRepository as defaultCourtRepository,
  CourtRepository,
} from '@/repositories/courtRepository';
import type { CaseSearchParams } from './caseService';
import {
  CaseCsvService,
  caseCsvService,
  type CaseCsvImportPayload,
  type CaseCsvImportOptions,
  type CaseCsvExportOptions,
} from './caseCsvService';
import {
  DailyImportBatchService,
  dailyImportBatchService,
} from './dailyImportBatchService';
import { BaseService, type ServiceContext } from './baseService';

export interface CreateImportBatchInput {
  importDate: Date;
  filename: string;
  fileSize: number;
  fileChecksum: string;
  totalRecords: number;
  createdBy: string;
  estimatedCompletionTime?: Date;
  userConfig?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  emptyRowsSkipped?: number;
}

export interface MarkBatchProcessingOptions {
  processingStartTime?: Date;
  estimatedCompletionTime?: Date;
}

export interface ProcessCsvBatchOptions {
  chunkSize?: number;
  totals?: {
    totalRecords: number;
    failedRecords?: number;
  };
  errorDetails?: Prisma.ImportErrorDetailCreateManyInput[];
  errorLogs?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  completedAt?: Date;
}

export class ImportService extends BaseService<DailyImportBatchRepository> {
  private readonly csvService: CaseCsvService;
  private readonly batchService: DailyImportBatchService;
  private readonly caseTypeRepository: CaseTypeRepository;
  private readonly courtRepository: CourtRepository;

  constructor(
    repository: DailyImportBatchRepository = dailyImportBatchRepository,
    csvService: CaseCsvService = caseCsvService,
    batchService: DailyImportBatchService = dailyImportBatchService,
    caseTypeRepository: CaseTypeRepository = defaultCaseTypeRepository,
    courtRepository: CourtRepository = defaultCourtRepository,
    context: ServiceContext = {}
  ) {
    super(repository, context);
    this.csvService = csvService;
    this.batchService = batchService;
    this.caseTypeRepository = caseTypeRepository;
    this.courtRepository = courtRepository;
  }

  createBatch(input: CreateImportBatchInput) {
    return this.execute(() =>
      this.repository.create(
        {
          data: {
            importDate: input.importDate,
            filename: input.filename,
            fileSize: input.fileSize,
            fileChecksum: input.fileChecksum,
            totalRecords: input.totalRecords,
            successfulRecords: 0,
            failedRecords: 0,
            errorLogs: '[]',
            status: ImportStatus.PENDING,
            createdBy: input.createdBy,
            estimatedCompletionTime: input.estimatedCompletionTime ?? null,
            processingStartTime: null,
            userConfig: JSON.stringify(input.userConfig ?? {}),
            validationWarnings: JSON.stringify(input.validationWarnings ?? []),
            emptyRowsSkipped: input.emptyRowsSkipped ?? 0,
          },
        } satisfies Prisma.DailyImportBatchCreateArgs
      )
    );
  }

  markBatchProcessing(batchId: string, options: MarkBatchProcessingOptions = {}) {
    return this.execute(() =>
      this.repository.update(
        {
          where: { id: batchId },
          data: {
            status: ImportStatus.PROCESSING,
            processingStartTime: options.processingStartTime ?? new Date(),
            estimatedCompletionTime: options.estimatedCompletionTime ?? null,
          },
        } satisfies Prisma.DailyImportBatchUpdateArgs
      )
    );
  }

  async processCsvBatch(
    batchId: string,
    payload: CaseCsvImportPayload,
    options: ProcessCsvBatchOptions = {}
  ) {
    const { chunkSize, totals, errorDetails, errorLogs, validationWarnings, completedAt } = options;

    const importOptions: CaseCsvImportOptions = {};
    if (typeof chunkSize === 'number') {
      importOptions.chunkSize = chunkSize;
    }

    const importResult = await this.csvService.importCaseData(payload, importOptions);

    const totalRecords = totals?.totalRecords ?? payload.cases.length;
    const successfulRecords = importResult.cases;
    const failedRecords = totals?.failedRecords ?? Math.max(totalRecords - successfulRecords, 0);

    await this.batchService.completeBatch(
      batchId,
      {
        successfulRecords,
        failedRecords,
        ...(typeof errorLogs !== 'undefined' ? { errorLogs } : {}),
        ...(typeof completedAt !== 'undefined' ? { completedAt } : {}),
        ...(typeof validationWarnings !== 'undefined' ? { validationWarnings } : {}),
      },
      errorDetails ?? []
    );

    return {
      batchId,
      totals: {
        totalRecords,
        successfulRecords,
        failedRecords,
      },
      importResult,
    };
  }

  async processCsvFile(
    batchId: string,
    filePath: string,
    options: ProcessCsvBatchOptions = {}
  ) {
    // Import required modules
    const csv = await import('csv-parser');
    const fs = await import('fs');
    const crypto = await import('crypto');

    const monthIndexByLabel: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };

    const normalizeString = (value: unknown) =>
      typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

    const KNOWN_COURT_TYPES: CourtType[] = ['SC', 'ELRC', 'ELC', 'KC', 'SCC', 'COA', 'MC', 'HC', 'KC'];
    const FALLBACK_COURT_TYPE: CourtType = 'TC';

    const slugify = (value: string) =>
      value
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

    const toCourtKey = (value: string) => value.toLowerCase();

    const inferCourtType = (raw?: string): CourtType => {
      if (!raw) {
        return FALLBACK_COURT_TYPE;
      }

      const candidate = raw.trim().toUpperCase();
      for (const code of KNOWN_COURT_TYPES) {
        if (candidate.startsWith(code)) {
          return code;
        }
      }

      return FALLBACK_COURT_TYPE;
    };

    const generateCourtCode = async (name: string, type: CourtType) => {
      const base = slugify(`${type}-${name}`) || `COURT-${Date.now()}`;
      let candidate = base;
      let counter = 1;

      // Ensure uniqueness across active/inactive courts
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const existing = await this.courtRepository.findByCode(candidate, { includeInactive: true });
        if (!existing) {
          return candidate;
        }
        candidate = `${base}-${counter}`;
        counter += 1;
      }
    };

    let unknownCourtId: string | null = null;
    const resolveUnknownCourtId = async () => {
      if (unknownCourtId) {
        return unknownCourtId;
      }

      const existing = await this.courtRepository.findByName('Unknown Court', { includeInactive: true });
      if (existing) {
        unknownCourtId = existing.id;
        return existing.id;
      }

      const courtCode = await generateCourtCode('Unknown Court', FALLBACK_COURT_TYPE);
      const created = await this.courtRepository.create({
        data: {
          courtName: 'Unknown Court',
          courtCode,
          courtType: FALLBACK_COURT_TYPE,
        },
      } satisfies Prisma.CourtCreateArgs);

      unknownCourtId = created.id;
      return created.id;
    };

    type CsvCellValue = string | number | boolean | null | undefined;
    type CsvParsedRow = Record<string, CsvCellValue>;

    const isCsvParsedRow = (input: unknown): input is CsvParsedRow => {
      if (!input || typeof input !== 'object') {
        return false;
      }

      return Object.values(input).every((value) =>
        value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value)
      );
    };

    const parseInteger = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }

      if (typeof value === 'string') {
        const numericString = value.replace(/[^0-9-]+/g, '').trim();
        if (numericString.length === 0) {
          return 0;
        }
        const parsed = Number.parseInt(numericString, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      }

      return 0;
    };

    const parseBoolean = (value: unknown) => {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'number') {
        return value > 0;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['yes', 'y', 'true', '1'].includes(normalized)) {
          return true;
        }
        if (['no', 'n', 'false', '0'].includes(normalized)) {
          return false;
        }
      }

      return false;
    };

    const parseDateParts = (day: unknown, month: unknown, year: unknown): Date | undefined => {
      const dayNumber = typeof day === 'number' ? day : Number.parseInt(normalizeString(day), 10);
      const monthLabel = normalizeString(month).toLowerCase();
      const monthIndex = monthIndexByLabel[monthLabel.slice(0, 3)];
      const yearNumber = typeof year === 'number' ? year : Number.parseInt(normalizeString(year), 10);

      if (
        Number.isFinite(dayNumber) &&
        typeof monthIndex === 'number' &&
        Number.isFinite(yearNumber)
      ) {
        return new Date(Date.UTC(yearNumber, monthIndex, dayNumber));
      }

      const fallbackString = normalizeString(year);
      if (fallbackString) {
        const fallbackDate = new Date(fallbackString);
        if (!Number.isNaN(fallbackDate.getTime())) {
          return fallbackDate;
        }
      }

      return undefined;
    };

    const parseDateValue = (value: unknown): Date | undefined => {
      if (value instanceof Date) {
        return value;
      }

      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      return undefined;
    };

    const deriveStatus = (outcomeRaw: unknown): CaseStatus => {
      const outcome = normalizeString(outcomeRaw).toLowerCase();
      if (
        outcome.includes('terminated') ||
        outcome.includes('dismissed') ||
        outcome.includes('closed') ||
        outcome.includes('resolved')
      ) {
        return 'RESOLVED';
      }
      return 'ACTIVE';
    };

    const buildPartiesPayload = (row: CsvParsedRow) => {
      const maleApplicant = parseInteger(row['male_applicant']);
      const femaleApplicant = parseInteger(row['female_applicant']);
      const organizationApplicant = parseInteger(row['organization_applicant']);
      const maleDefendant = parseInteger(row['male_defendant']);
      const femaleDefendant = parseInteger(row['female_defendant']);
      const organizationDefendant = parseInteger(row['organization_defendant']);

      return JSON.stringify({
        summary: {
          maleApplicant,
          femaleApplicant,
          organizationApplicant,
          maleDefendant,
          femaleDefendant,
          organizationDefendant,
        },
      });
    };

    const deriveCaseNumber = (row: CsvParsedRow, index: number) => {
      const type = normalizeString(row['caseid_type']);
      const number = normalizeString(row['caseid_no']);
      const filedYear = normalizeString(row['filed_yyyy']) || normalizeString(row['date_yyyy']) || normalizeString(row['original_year']);

      const segments = [type, number, filedYear].filter((segment) => segment.length > 0);

      if (segments.length === 0) {
        return `unknown-${index}`;
      }

      return segments.join('/');
    };

    const collectCaseTypeCode = (row: CsvParsedRow) => {
      const code = normalizeString(row['caseid_type']) || normalizeString(row['case_type']) || normalizeString(row['caseTypeId']);
      return code.length > 0 ? code : '';
    };

    const collectCaseTypeName = (row: CsvParsedRow) => {
      const name = normalizeString(row['case_type']) || normalizeString(row['caseType']) || normalizeString(row['caseTypeName']);
      return name.length > 0 ? name : '';
    };

    type ProcessResult = Awaited<ReturnType<typeof this.processCsvBatch>>;

    return new Promise<ProcessResult>((resolve, reject) => {
      const results: CsvParsedRow[] = [];
      let totalRecords = 0;

      fs.createReadStream(filePath)
        .pipe(csv.default())
        .on('data', (data: unknown) => {
          if (isCsvParsedRow(data)) {
            results.push(data);
            totalRecords++;
          } else {
            this.logger.warn('Skipping CSV row with unexpected format');
          }
        })
        .on('end', () => {
          void (async () => {
            try {
              // Calculate file checksum
              const fileBuffer = fs.readFileSync(filePath);
              const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');

              // Update batch with actual record count and checksum
              await this.repository.update({
                where: { id: batchId },
                data: {
                  totalRecords,
                  fileChecksum: checksum,
                },
              });

              const uniqueCaseTypes = new Map<string, string>();
              const uniqueCourts = new Map<string, { displayName: string; caseIdType?: string }>();

              const registerCourtName = (rawName: string, caseIdType?: string) => {
                const displayName = rawName.length > 0 ? rawName : 'Unknown Court';
                const key = toCourtKey(displayName);
                const existing = uniqueCourts.get(key);
                const candidateType = caseIdType && caseIdType.length > 0 ? caseIdType : undefined;

                if (existing) {
                  if (!existing.caseIdType && candidateType) {
                    existing.caseIdType = candidateType;
                  }
                  return;
                }

                uniqueCourts.set(key, {
                  displayName,
                  caseIdType: candidateType,
                });
              };

              for (const row of results) {
                const code = collectCaseTypeCode(row);
                if (!code) {
                  continue;
                }
                if (!uniqueCaseTypes.has(code)) {
                  const name = collectCaseTypeName(row) || code;
                  uniqueCaseTypes.set(code, name);
                }

                const courtName = normalizeString(row['court']);
                const caseIdType = normalizeString(row['caseid_type']);
                registerCourtName(courtName, caseIdType);

                const originalCourtName = normalizeString(row['original_court']);
                const originalCaseType = normalizeString(row['original_code']) || caseIdType;
                if (originalCourtName.length > 0) {
                  registerCourtName(originalCourtName, originalCaseType);
                }
              }

              const caseTypeIdByCode = new Map<string, string>();
              for (const [code, name] of uniqueCaseTypes.entries()) {
                const existing = await this.caseTypeRepository.findByCode(code);
                if (existing) {
                  caseTypeIdByCode.set(code, existing.id);
                  continue;
                }

                const created = await this.caseTypeRepository.create({
                  data: {
                    caseTypeCode: code,
                    caseTypeName: name || code,
                  },
                } satisfies Prisma.CaseTypeCreateArgs);

                caseTypeIdByCode.set(code, created.id);
              }

              const courtIdByKey = new Map<string, string>();
              for (const [key, descriptor] of uniqueCourts.entries()) {
                const { displayName, caseIdType } = descriptor;

                if (displayName === 'Unknown Court') {
                  const unknownId = await resolveUnknownCourtId();
                  courtIdByKey.set(key, unknownId);
                  continue;
                }

                const existing = await this.courtRepository.findByName(displayName, { includeInactive: true });
                if (existing) {
                  courtIdByKey.set(key, existing.id);
                  continue;
                }

                const courtType = inferCourtType(caseIdType);
                const courtCode = await generateCourtCode(displayName, courtType);

                const createdCourt = await this.courtRepository.create({
                  data: {
                    courtName: displayName,
                    courtCode,
                    courtType,
                  },
                } satisfies Prisma.CourtCreateArgs);

                courtIdByKey.set(key, createdCourt.id);
              }

              let unknownCaseTypeId: string | null = null;
              const resolveUnknownCaseTypeId = async () => {
                if (unknownCaseTypeId) {
                  return unknownCaseTypeId;
                }

                const existing = await this.caseTypeRepository.findByCode('UNKNOWN');
                if (existing) {
                  unknownCaseTypeId = existing.id;
                  return existing.id;
                }

                const created = await this.caseTypeRepository.create({
                  data: {
                    caseTypeCode: 'UNKNOWN',
                    caseTypeName: 'Unknown Case Type',
                    description: 'Auto-generated placeholder for unmapped case types',
                  },
                } satisfies Prisma.CaseTypeCreateArgs);

                unknownCaseTypeId = created.id;
                return created.id;
              };

              const cases: Prisma.CaseCreateManyInput[] = [];

              for (const [index, row] of results.entries()) {
                const caseTypeCode = collectCaseTypeCode(row);
                const caseTypeId = caseTypeCode ? caseTypeIdByCode.get(caseTypeCode) : undefined;
                const resolvedCaseTypeId = caseTypeId ?? (await resolveUnknownCaseTypeId());

                const filedDate =
                  parseDateParts(row['filed_dd'], row['filed_mon'], row['filed_yyyy']) ??
                  parseDateValue(row['filedDate']) ??
                  new Date();

                const activityDate = parseDateParts(row['date_dd'], row['date_mon'], row['date_yyyy']);
                const nextHearingDate = parseDateParts(row['next_dd'], row['next_mon'], row['next_yyyy']);

                const courtName = normalizeString(row['court']) || 'Unknown Court';
                const courtKey = toCourtKey(courtName);
                const resolvedCourtId = courtIdByKey.get(courtKey) ?? (await resolveUnknownCourtId());

                const originalCourtName = normalizeString(row['original_court']);
                const originalCourtId = originalCourtName.length > 0 ? courtIdByKey.get(toCourtKey(originalCourtName)) ?? null : null;

                cases.push({
                  caseNumber: deriveCaseNumber(row, index),
                  courtId: resolvedCourtId,
                  originalCourtId,
                  caseTypeId: resolvedCaseTypeId,
                  filedDate,
                  status: deriveStatus(row['outcome']),
                  totalActivities:
                    parseInteger(row['total_activities']) ||
                    parseInteger(row['totalActivities']) ||
                    (normalizeString(row['comingfor']) ? 1 : 0),
                  parties: buildPartiesPayload(row),
                  hasLegalRepresentation: parseBoolean(row['legalrep']),
                  maleApplicant: parseInteger(row['male_applicant']),
                  femaleApplicant: parseInteger(row['female_applicant']),
                  organizationApplicant: parseInteger(row['organization_applicant']),
                  maleDefendant: parseInteger(row['male_defendant']),
                  femaleDefendant: parseInteger(row['female_defendant']),
                  organizationDefendant: parseInteger(row['organization_defendant']),
                  lastActivityDate: nextHearingDate ?? activityDate ?? null,
                  caseidNo: normalizeString(row['caseid_no']) || null,
                  originalCaseNumber: normalizeString(row['original_number']) || null,
                  originalYear: parseInteger(row['original_year']) || null,
                } satisfies Prisma.CaseCreateManyInput);
              }

              // Convert CSV data to the expected format
              // Process the parsed data
              const result = await this.processCsvBatch(
                batchId,
                { cases },
                { ...options, totals: { totalRecords, failedRecords: 0 } }
              );

              resolve(result);
            } catch (error) {
              reject(error);
            }
        })();
      })
        .on('error', (error: Error) => {
          reject(error);
        });
    });
  }

  failBatch(batchId: string, errorLogs: Prisma.InputJsonValue) {
    return this.batchService.failBatch(batchId, errorLogs);
  }

  exportCasesForCsv(params: CaseSearchParams = {}, options: CaseCsvExportOptions = {}) {
    return this.csvService.exportCasesForCsv(params, options);
  }

  getBatchById(batchId: string, options: { includeErrorDetails?: boolean } = {}) {
    return this.batchService.getBatchById(batchId, options);
  }

  async queueCsvImport(
    batchId: string,
    payload: CaseCsvImportPayload,
    options: ProcessCsvBatchOptions = {}
  ) {
    const jobOptions: CsvImportJobData['options'] = {};

    if (options.chunkSize !== undefined) jobOptions.chunkSize = options.chunkSize;
    if (options.totals !== undefined) jobOptions.totals = options.totals;
    if (options.errorDetails !== undefined) jobOptions.errorDetails = options.errorDetails;
    if (options.errorLogs !== undefined) jobOptions.errorLogs = options.errorLogs;
    if (options.validationWarnings !== undefined) jobOptions.validationWarnings = options.validationWarnings;
    if (options.completedAt !== undefined) jobOptions.completedAt = options.completedAt.toISOString();

    const jobData: CsvImportJobData = {
      batchId,
      payload,
      options: jobOptions,
    };

    const job = await csvImportQueue.add('csv-import', jobData, {
      priority: 1, // High priority for imports
      delay: 0, // Start immediately
    });

    return {
      jobId: job.id,
      batchId,
    };
  }

  async queueCsvImportWithFile(
    batchId: string,
    filePath: string,
    options: ProcessCsvBatchOptions = {}
  ) {
    const jobOptions: CsvImportJobData['options'] = {};

    if (options.chunkSize !== undefined) jobOptions.chunkSize = options.chunkSize;
    if (options.totals !== undefined) jobOptions.totals = options.totals;
    if (options.errorDetails !== undefined) jobOptions.errorDetails = options.errorDetails;
    if (options.errorLogs !== undefined) jobOptions.errorLogs = options.errorLogs;
    if (options.validationWarnings !== undefined) jobOptions.validationWarnings = options.validationWarnings;
    if (options.completedAt !== undefined) jobOptions.completedAt = options.completedAt.toISOString();

    const jobData: CsvImportJobData = {
      batchId,
      filePath,
      options: jobOptions,
    };

    const job = await csvImportQueue.add('csv-import-file', jobData, {
      priority: 1, // High priority for imports
      delay: 0, // Start immediately
    });

    return {
      jobId: job.id,
      batchId,
    };
  }

  async getJobStatus(jobId: string) {
    try {
    const job = await csvImportQueue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress;

      return {
        jobId,
        state,
        progress,
        data: job.data,
        opts: job.opts,
        attemptsMade: job.attemptsMade,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        failedReason: job.failedReason,
      };
    } catch (error) {
      throw new Error(`Failed to get job status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getRecentBatches(limit = 10) {
    return this.batchService.getRecentBatches(limit);
  }
}

export const importService = new ImportService();
