import { Request, Response, NextFunction } from 'express';
import { calculateFileChecksum } from '@/utils/checksum';
import { Prisma } from '@prisma/client';

// Extend Request interface for multer
declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
      body: any; // Allow any body for form data
    }
  }
}

import {
  importService,
  ImportService,
  type CreateImportBatchInput,
  type ProcessCsvBatchOptions,
} from '@/services/importService';
import type { CaseSearchParams } from '@/services/caseService';

const DEFAULT_CREATED_BY = 'system';

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

const toCaseSearchParams = (query: any): CaseSearchParams => {
  const params: CaseSearchParams = {};

  if (typeof query['courtName'] === 'string') {
    params.courtName = query['courtName'];
  }

  if (typeof query['caseTypeId'] === 'string') {
    params.caseTypeId = query['caseTypeId'];
  }

  if (typeof query['status'] === 'string') {
    params.status = query['status'] as any;
  }

  const filedFrom = parseDate(query['filedFrom']);
  if (filedFrom) {
    params.filedFrom = filedFrom;
  }

  const filedTo = parseDate(query['filedTo']);
  if (filedTo) {
    params.filedTo = filedTo;
  }

  return params;
};

export class ImportController {
  constructor(private readonly service: ImportService = importService) {}

  async uploadCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({ message: 'CSV file is required.' });
        return;
      }

      // Parse metadata and options from form data (they come as strings)
      let metadata: Record<string, unknown> = {};
      let options: Record<string, unknown> = {};

      try {
        if (req.body.metadata) {
          metadata = JSON.parse(req.body.metadata);
        }
      } catch (error) {
        // Invalid JSON, use empty object
      }

      try {
        if (req.body.options) {
          options = JSON.parse(req.body.options);
        }
      } catch (error) {
        // Invalid JSON, use empty object
      }

      const importDate = parseDate(metadata['importDate']) ?? new Date();
      const fileSize = req.file.size;
      const createdBy = typeof metadata['createdBy'] === 'string' ? metadata['createdBy'] : DEFAULT_CREATED_BY;
      const estimatedCompletionTime = parseDate(metadata['estimatedCompletionTime']);

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
      if (metadata['userConfig'] !== undefined && metadata['userConfig'] !== null) {
        batchInput.userConfig = metadata['userConfig'] as Prisma.InputJsonValue;
      }
      if (metadata['validationWarnings'] !== undefined && metadata['validationWarnings'] !== null) {
        batchInput.validationWarnings = metadata['validationWarnings'] as Prisma.InputJsonValue;
      }
      if (typeof metadata['emptyRowsSkipped'] === 'number') {
        batchInput.emptyRowsSkipped = metadata['emptyRowsSkipped'];
      }

      const batch = await this.service.createBatch(batchInput);

      // Queue the CSV processing job with file path
      const processOptions: ProcessCsvBatchOptions = {};
      if (typeof options['chunkSize'] === 'number') {
        processOptions.chunkSize = options['chunkSize'];
      }
      if (Array.isArray(options['errorDetails'])) {
        processOptions.errorDetails = options['errorDetails'] as Prisma.ImportErrorDetailCreateManyInput[];
      }
      if (options['errorLogs'] !== undefined && options['errorLogs'] !== null) {
        processOptions.errorLogs = options['errorLogs'] as Prisma.InputJsonValue;
      }
      if (options['validationWarnings'] !== undefined && options['validationWarnings'] !== null) {
        processOptions.validationWarnings = options['validationWarnings'] as Prisma.InputJsonValue;
      }

      const completedAt = parseDate(options['completedAt']);
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

  async getBatchStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
   const batchId = req.params['batchId'];
      if (!batchId) {
        res.status(400).json({ message: 'Batch ID is required.' });
        return;
      }

      const batch = await this.service.getBatchById(batchId, {
   includeErrorDetails: req.query['includeErrors'] === 'true',
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

  async getJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = req.params['jobId'];
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

  async listRecentBatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
  const limit = typeof req.query['limit'] === 'string' ? Number.parseInt(req.query['limit'], 10) : 10;
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
  const pageSize = typeof req.query['pageSize'] === 'string' ? Number.parseInt(req.query['pageSize'], 10) : undefined;
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
