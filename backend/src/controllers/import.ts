import type { Request, Response, NextFunction } from 'express';
import { calculateFileChecksum } from '@/utils/checksum';
import { Prisma, CaseStatus } from '@prisma/client';

import {
  importService,
  ImportService,
  type CreateImportBatchInput,
  type ProcessCsvBatchOptions,
} from '@/services/importService';
import type { CaseSearchParams } from '@/services/caseService';

const CSV_HEADERS = [
  'caseNumber',
  'courtName',
  'caseType',
  'filedDate',
  'status',
  'totalActivities',
];

type ImportMetadataPayload = {
  importDate?: string;
  createdBy?: string;
  estimatedCompletionTime?: string;
  userConfig?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  emptyRowsSkipped?: number;
};

type ImportOptionsPayload = {
  chunkSize?: number;
  errorDetails?: Prisma.ImportErrorDetailCreateManyInput[];
  errorLogs?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  completedAt?: string;
};

const parseJson = <T>(value: string | undefined): T | undefined => {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

type FormBodyRecord = Record<string, string | string[] | undefined>;
type BatchStatusQuery = { includeErrors?: string | string[] };
type RecentBatchesQuery = { limit?: string | string[] };
type ExportCasesQuery = {
  courtName?: string | string[];
  caseTypeId?: string | string[];
  status?: string | string[];
  filedFrom?: string | string[];
  filedTo?: string | string[];
  pageSize?: string | string[];
};

const emptyFormBody: FormBodyRecord = {};

const toFormBody = (body: FormBodyRecord | undefined | null): FormBodyRecord => body ?? emptyFormBody;

const pickFormValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return value;
};

const getUserId = (req: Request): string | undefined => {
  const possibleUser = (req as { user?: { id?: string } | null }).user;
  if (possibleUser && typeof possibleUser.id === 'string') {
    return possibleUser.id;
  }
  return undefined;
};

const escapeCsvValue = (value: string | number | boolean | Date | null | undefined): string => {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  const stringValue = value instanceof Date ? value.toISOString() : String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }

  return stringValue;
};

const parseDate = (value: string | number | Date | null | undefined): Date | undefined => {
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return undefined;
};

const toCaseSearchParams = (query: ExportCasesQuery): CaseSearchParams => {
  const params: CaseSearchParams = {};

  const courtName = pickFormValue(query.courtName);
  if (courtName) {
    params.courtName = courtName;
  }

  const caseTypeId = pickFormValue(query.caseTypeId);
  if (caseTypeId) {
    params.caseTypeId = caseTypeId;
  }

  const status = pickFormValue(query.status);
  if (status) {
    params.status = status as CaseStatus;
  }

  const filedFrom = parseDate(pickFormValue(query.filedFrom));
  if (filedFrom) {
    params.filedFrom = filedFrom;
  }

  const filedTo = parseDate(pickFormValue(query.filedTo));
  if (filedTo) {
    params.filedTo = filedTo;
  }

  return params;
};

export class ImportController {
  constructor(private readonly service: ImportService = importService) {}

  async uploadCsv(
  req: Request<Record<string, string>, Record<string, never>, FormBodyRecord>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({ message: 'CSV file is required.' });
        return;
      }

      // Parse metadata and options from form data (they come as strings)
  const formBody = toFormBody(req.body);
      const metadata = parseJson<ImportMetadataPayload>(pickFormValue(formBody['metadata'])) ?? {};
      const options = parseJson<ImportOptionsPayload>(pickFormValue(formBody['options'])) ?? {};

      const importDate = parseDate(metadata.importDate) ?? new Date();
      const fileSize = req.file.size;
      const createdBy = getUserId(req) ?? metadata.createdBy;
      if (!createdBy) {
        res.status(400).json({ message: 'Authenticated user context is required to create import batches.' });
        return;
      }
      const estimatedCompletionTime = parseDate(metadata.estimatedCompletionTime);

      // Calculate file checksum
      const checksumResult = await calculateFileChecksum(req.file.path, 'md5');

      // For now, we'll set totalRecords to 0 and update it after parsing
      // The worker will update this after reading the file
      const batchInput: CreateImportBatchInput = {
        importDate,
        filename: req.file.originalname,
        fileSize,
        fileChecksum: checksumResult.checksum,
        totalRecords: 0, // Will be updated by worker
        createdBy,
      };

      if (estimatedCompletionTime) {
        batchInput.estimatedCompletionTime = estimatedCompletionTime;
      }
      if (metadata.userConfig !== undefined && metadata.userConfig !== null) {
        batchInput.userConfig = metadata.userConfig;
      }
      if (metadata.validationWarnings !== undefined && metadata.validationWarnings !== null) {
        batchInput.validationWarnings = metadata.validationWarnings;
      }
      if (typeof metadata.emptyRowsSkipped === 'number') {
        batchInput.emptyRowsSkipped = metadata.emptyRowsSkipped;
      }

      const batch = await this.service.createBatch(batchInput);

      // Queue the CSV processing job with file path
      const processOptions: ProcessCsvBatchOptions = {};
      if (typeof options.chunkSize === 'number') {
        processOptions.chunkSize = options.chunkSize;
      }
      if (Array.isArray(options.errorDetails) && options.errorDetails.length > 0) {
        processOptions.errorDetails = options.errorDetails;
      }
      if (options.errorLogs !== undefined && options.errorLogs !== null) {
        processOptions.errorLogs = options.errorLogs;
      }
      if (options.validationWarnings !== undefined && options.validationWarnings !== null) {
        processOptions.validationWarnings = options.validationWarnings;
      }

      const completedAt = parseDate(options.completedAt);
      if (completedAt) {
        processOptions.completedAt = completedAt;
      }

      const jobResult = await this.service.queueCsvImportWithFile(
        batch.id,
        req.file.path,
        processOptions
      );

      res.status(202).json({
        batchId: batch.id,
        jobId: jobResult.jobId,
        status: 'queued',
        message: 'CSV import job has been queued for processing',
      });
    } catch (error) {
      next(error);
    }
  }

  async getBatchStatus(
    req: Request<{ batchId: string }, Record<string, never>, Record<string, never>, BatchStatusQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
  const batchId = req.params.batchId;
      if (!batchId) {
        res.status(400).json({ message: 'Batch ID is required.' });
        return;
      }

      const batch = await this.service.getBatchById(batchId, {
        includeErrorDetails: pickFormValue(req.query.includeErrors) === 'true',
      });

      if (!batch) {
        res.status(404).json({ message: `Batch ${batchId} not found.` });
        return;
      }

      res.status(200).json(batch);
    } catch (error) {
      next(error);
    }
  }

  async getJobStatus(req: Request<{ jobId: string }>, res: Response, next: NextFunction): Promise<void> {
    try {
  const jobId = req.params.jobId;
      if (!jobId) {
        res.status(400).json({ message: 'Job ID is required.' });
        return;
      }

      const jobStatus = await this.service.getJobStatus(jobId);
      if (!jobStatus) {
        res.status(404).json({ message: `Job ${jobId} not found.` });
        return;
      }

      res.status(200).json(jobStatus);
    } catch (error) {
      next(error);
    }
  }

  async listRecentBatches(
    req: Request<Record<string, string>, Record<string, never>, Record<string, never>, RecentBatchesQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
  const limitInput = pickFormValue(req.query.limit);
      const limit = typeof limitInput === 'string' ? Number.parseInt(limitInput, 10) : 10;
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10;

      const batches = await this.service.getRecentBatches(safeLimit);
      res.status(200).json({ batches });
    } catch (error) {
      next(error);
    }
  }

  async exportCases(
    req: Request<Record<string, string>, Record<string, never>, Record<string, never>, ExportCasesQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
  const params = toCaseSearchParams(req.query);
  const pageSizeValue = pickFormValue(req.query.pageSize);
      const pageSize = typeof pageSizeValue === 'string' ? Number.parseInt(pageSizeValue, 10) : undefined;
      const safePageSize = typeof pageSize === 'number' && Number.isFinite(pageSize) && pageSize >= 1 ? pageSize : undefined;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cases-export-${Date.now()}.csv"`
      );

      res.write(`${CSV_HEADERS.join(',')}\n`);

      const iterator = this.service.exportCasesForCsv(params, {
        ...(safePageSize ? { pageSize: safePageSize } : {}),
        include: { caseType: true },
      });

      for await (const casesChunk of iterator) {
        for (const caseRecord of casesChunk) {
          const row = [
            caseRecord.caseNumber,
            caseRecord.courtName,
            caseRecord.caseType?.caseTypeName,
            caseRecord.filedDate ? new Date(caseRecord.filedDate).toISOString().split('T')[0] : '',
            caseRecord.status,
            caseRecord.totalActivities ?? 0,
          ];
          res.write(`${row.map(escapeCsvValue).join(',')}\n`);
        }
      }

      res.end();
    } catch (error) {
      next(error);
    }
  }
}

export const importController = new ImportController();
