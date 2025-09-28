import type { Request, Response, NextFunction } from 'express';
import { CaseStatus } from '@prisma/client';

import { importService, ImportService, type ProcessCsvBatchOptions } from '@/services/importService';
import type { CaseSearchParams } from '@/services/caseService';

const DEFAULT_FILENAME = 'cases.csv';
const DEFAULT_CREATED_BY = 'system';
const DEFAULT_FILE_CHECKSUM = 'unknown';

const CSV_HEADERS = [
  'caseNumber',
  'courtName',
  'caseType',
  'filedDate',
  'status',
  'totalActivities',
];

const escapeCsvValue = (value: unknown): string => {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }

  return stringValue;
};

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value === 'string' || value instanceof Date) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return undefined;
};

const toCaseSearchParams = (query: Request['query']): CaseSearchParams => {
  const params: CaseSearchParams = {};

  if (typeof query.courtName === 'string') {
    params.courtName = query.courtName;
  }

  if (typeof query.caseTypeId === 'string') {
    params.caseTypeId = query.caseTypeId;
  }

  if (typeof query.status === 'string' && query.status in CaseStatus) {
    params.status = query.status as CaseStatus;
  }

  const filedFrom = parseDate(query.filedFrom);
  if (filedFrom) {
    params.filedFrom = filedFrom;
  }

  const filedTo = parseDate(query.filedTo);
  if (filedTo) {
    params.filedTo = filedTo;
  }

  return params;
};

export class ImportController {
  constructor(private readonly service: ImportService = importService) {}

  async uploadCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metadata = (req.body?.metadata ?? {}) as Record<string, unknown>;
      const payload = req.body?.payload as { cases?: unknown[]; activities?: unknown[]; assignments?: unknown[] } | undefined;
      const options = (req.body?.options ?? {}) as Record<string, unknown>;

      if (!payload?.cases || !Array.isArray(payload.cases) || payload.cases.length === 0) {
        res.status(400).json({ message: 'CSV payload must include at least one case record.' });
        return;
      }

      const importDate = parseDate(metadata.importDate) ?? new Date();
      const totalRecords = typeof metadata.totalRecords === 'number' ? metadata.totalRecords : payload.cases.length;
      const fileSize = typeof metadata.fileSize === 'number' ? metadata.fileSize : payload.cases.length;
      const createdBy = typeof metadata.createdBy === 'string' ? metadata.createdBy : DEFAULT_CREATED_BY;
      const estimatedCompletionTime = parseDate(metadata.estimatedCompletionTime);

      const batch = await this.service.createBatch({
        importDate,
        filename: typeof metadata.filename === 'string' ? metadata.filename : DEFAULT_FILENAME,
        fileSize,
        fileChecksum: typeof metadata.fileChecksum === 'string' ? metadata.fileChecksum : DEFAULT_FILE_CHECKSUM,
        totalRecords,
        createdBy,
        estimatedCompletionTime,
        userConfig: metadata.userConfig as any,
        validationWarnings: metadata.validationWarnings as any,
        emptyRowsSkipped: typeof metadata.emptyRowsSkipped === 'number' ? metadata.emptyRowsSkipped : undefined,
      });

      await this.service.markBatchProcessing(batch.id, {
        processingStartTime: new Date(),
        estimatedCompletionTime,
      });

  const processOptions: ProcessCsvBatchOptions = {};
      if (typeof options.chunkSize === 'number') {
        processOptions.chunkSize = options.chunkSize;
      }
      if (typeof options.skipDuplicates === 'boolean') {
        processOptions.skipDuplicates = options.skipDuplicates;
      }
      if (options.totals && typeof options.totals === 'object') {
        const totals = options.totals as Record<string, unknown>;
        processOptions.totals = {
          totalRecords: typeof totals.totalRecords === 'number' ? totals.totalRecords : totalRecords,
          failedRecords: typeof totals.failedRecords === 'number' ? totals.failedRecords : undefined,
        };
      }
      if (Array.isArray(options.errorDetails)) {
        processOptions.errorDetails = options.errorDetails as any;
      }
      if (typeof options.errorLogs !== 'undefined') {
        processOptions.errorLogs = options.errorLogs as any;
      }
      if (typeof options.validationWarnings !== 'undefined') {
        processOptions.validationWarnings = options.validationWarnings as any;
      }

      const completedAt = parseDate(options.completedAt);
      if (completedAt) {
        processOptions.completedAt = completedAt;
      }

      const importResult = await this.service.processCsvBatch(
        batch.id,
        {
          cases: payload.cases as any,
          activities: payload.activities as any,
          assignments: payload.assignments as any,
        },
        processOptions
      );

      res.status(202).json({
        batchId: batch.id,
        status: 'completed',
        result: importResult,
      });
    } catch (error) {
      next(error);
    }
  }

  async getBatchStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const batchId = req.params.batchId;
      if (!batchId) {
        res.status(400).json({ message: 'Batch ID is required.' });
        return;
      }

      const batch = await this.service.getBatchById(batchId, {
        includeErrorDetails: req.query.includeErrors === 'true',
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

  async listRecentBatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 10;
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10;

      const batches = await this.service.getRecentBatches(safeLimit);
      res.status(200).json({ batches });
    } catch (error) {
      next(error);
    }
  }

  async exportCases(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params = toCaseSearchParams(req.query);
  const pageSize = typeof req.query.pageSize === 'string' ? Number.parseInt(req.query.pageSize, 10) : undefined;
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
        for (const caseRecord of casesChunk as any[]) {
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
