import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { CaseStatus } from '@prisma/client';

import {
  importService,
  ImportService,
  type CreateImportBatchInput,
  type MarkBatchProcessingOptions,
  type ProcessCsvBatchOptions,
} from '@/services/importService';
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown): value is Prisma.InputJsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
};

const isCaseCreateManyInputArray = (value: unknown): value is Prisma.CaseCreateManyInput[] =>
  Array.isArray(value) && value.every(isPlainObject);

const isCaseActivityCreateManyInputArray = (value: unknown): value is Prisma.CaseActivityCreateManyInput[] =>
  Array.isArray(value) && value.every(isPlainObject);

const isCaseJudgeAssignmentCreateManyInputArray = (value: unknown): value is Prisma.CaseJudgeAssignmentCreateManyInput[] =>
  Array.isArray(value) && value.every(isPlainObject);

const isImportErrorDetailArray = (value: unknown): value is Prisma.ImportErrorDetailCreateManyInput[] =>
  Array.isArray(value) && value.every(isPlainObject);

const isTotalsInput = (value: unknown): value is { totalRecords?: number; failedRecords?: number } =>
  isPlainObject(value) &&
  (typeof value['totalRecords'] === 'undefined' || typeof value['totalRecords'] === 'number') &&
  (typeof value['failedRecords'] === 'undefined' || typeof value['failedRecords'] === 'number');

type UploadCsvMetadata = {
  importDate?: string | Date;
  filename?: string;
  fileSize?: number;
  fileChecksum?: string;
  totalRecords?: number;
  createdBy?: string;
  estimatedCompletionTime?: string | Date;
  userConfig?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  emptyRowsSkipped?: number;
};

const isUploadCsvMetadata = (value: unknown): value is UploadCsvMetadata =>
  isPlainObject(value) &&
  (typeof value['importDate'] === 'undefined' || value['importDate'] instanceof Date || typeof value['importDate'] === 'string') &&
  (typeof value['filename'] === 'undefined' || typeof value['filename'] === 'string') &&
  (typeof value['fileSize'] === 'undefined' || typeof value['fileSize'] === 'number') &&
  (typeof value['fileChecksum'] === 'undefined' || typeof value['fileChecksum'] === 'string') &&
  (typeof value['totalRecords'] === 'undefined' || typeof value['totalRecords'] === 'number') &&
  (typeof value['createdBy'] === 'undefined' || typeof value['createdBy'] === 'string') &&
  (typeof value['estimatedCompletionTime'] === 'undefined' || value['estimatedCompletionTime'] instanceof Date || typeof value['estimatedCompletionTime'] === 'string') &&
  (typeof value['userConfig'] === 'undefined' || isJsonValue(value['userConfig'])) &&
  (typeof value['validationWarnings'] === 'undefined' || isJsonValue(value['validationWarnings'])) &&
  (typeof value['emptyRowsSkipped'] === 'undefined' || typeof value['emptyRowsSkipped'] === 'number');

type UploadCsvPayload = {
  cases: Prisma.CaseCreateManyInput[];
  activities?: Prisma.CaseActivityCreateManyInput[];
  assignments?: Prisma.CaseJudgeAssignmentCreateManyInput[];
};

const isUploadCsvPayload = (value: unknown): value is UploadCsvPayload =>
  isPlainObject(value) &&
  isCaseCreateManyInputArray(value['cases']) &&
  (typeof value['activities'] === 'undefined' || isCaseActivityCreateManyInputArray(value['activities'])) &&
  (typeof value['assignments'] === 'undefined' || isCaseJudgeAssignmentCreateManyInputArray(value['assignments']));

type UploadCsvOptions = {
  chunkSize?: number;
  skipDuplicates?: boolean;
  totals?: { totalRecords?: number; failedRecords?: number };
  errorDetails?: Prisma.ImportErrorDetailCreateManyInput[];
  errorLogs?: Prisma.InputJsonValue;
  validationWarnings?: Prisma.InputJsonValue;
  completedAt?: string | Date;
};

const isUploadCsvOptions = (value: unknown): value is UploadCsvOptions =>
  isPlainObject(value) &&
  (typeof value['chunkSize'] === 'undefined' || typeof value['chunkSize'] === 'number') &&
  (typeof value['skipDuplicates'] === 'undefined' || typeof value['skipDuplicates'] === 'boolean') &&
  (typeof value['totals'] === 'undefined' || isTotalsInput(value['totals'])) &&
  (typeof value['errorDetails'] === 'undefined' || isImportErrorDetailArray(value['errorDetails'])) &&
  (typeof value['errorLogs'] === 'undefined' || isJsonValue(value['errorLogs'])) &&
  (typeof value['validationWarnings'] === 'undefined' || isJsonValue(value['validationWarnings'])) &&
  (typeof value['completedAt'] === 'undefined' || value['completedAt'] instanceof Date || typeof value['completedAt'] === 'string');

type UploadCsvRequestBody = {
  metadata?: UploadCsvMetadata;
  payload?: UploadCsvPayload;
  options?: UploadCsvOptions;
};

const parseUploadCsvRequestBody = (value: unknown): UploadCsvRequestBody => {
  if (!isPlainObject(value)) {
    return {};
  }

  const result: UploadCsvRequestBody = {};

  if (isUploadCsvMetadata(value['metadata'])) {
    result.metadata = value['metadata'];
  }

  if (isUploadCsvPayload(value['payload'])) {
    result.payload = value['payload'];
  }

  if (isUploadCsvOptions(value['options'])) {
    result.options = value['options'];
  }

  return result;
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

  if (typeof query['courtName'] === 'string') {
    params.courtName = query['courtName'];
  }

  if (typeof query['caseTypeId'] === 'string') {
    params.caseTypeId = query['caseTypeId'];
  }

  if (typeof query['status'] === 'string' && query['status'] in CaseStatus) {
    params.status = query['status'] as CaseStatus;
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
      const { metadata = {}, payload, options = {} } = parseUploadCsvRequestBody(req.body);

      if (!payload) {
        res.status(400).json({ message: 'CSV payload must include at least one case record.' });
        return;
      }

      if (payload['cases'].length === 0) {
        res.status(400).json({ message: 'CSV payload must include at least one case record.' });
        return;
      }

      const importDate = parseDate(metadata['importDate']) ?? new Date();
      const totalRecords = typeof metadata['totalRecords'] === 'number' ? metadata['totalRecords'] : payload['cases'].length;
      const fileSize = typeof metadata['fileSize'] === 'number' ? metadata['fileSize'] : payload['cases'].length;
  const createdBy = typeof metadata['createdBy'] === 'string' ? metadata['createdBy'] : DEFAULT_CREATED_BY;
  const estimatedCompletionTime = parseDate(metadata['estimatedCompletionTime']);

      const batchInput: CreateImportBatchInput = {
        importDate,
        filename: typeof metadata['filename'] === 'string' ? metadata['filename'] : DEFAULT_FILENAME,
        fileSize,
        fileChecksum: typeof metadata['fileChecksum'] === 'string' ? metadata['fileChecksum'] : DEFAULT_FILE_CHECKSUM,
        totalRecords,
        createdBy,
      };

      if (estimatedCompletionTime) {
        batchInput.estimatedCompletionTime = estimatedCompletionTime;
      }
      if (typeof metadata['userConfig'] !== 'undefined') {
        batchInput.userConfig = metadata['userConfig'];
      }
      if (typeof metadata['validationWarnings'] !== 'undefined') {
        batchInput.validationWarnings = metadata['validationWarnings'];
      }
      if (typeof metadata['emptyRowsSkipped'] === 'number') {
        batchInput.emptyRowsSkipped = metadata['emptyRowsSkipped'];
      }

      const batch = await this.service.createBatch(batchInput);

      const processingOptions: MarkBatchProcessingOptions = {
        processingStartTime: new Date(),
      };

      if (estimatedCompletionTime) {
        processingOptions.estimatedCompletionTime = estimatedCompletionTime;
      }

      await this.service.markBatchProcessing(batch.id, processingOptions);

      const processOptions: ProcessCsvBatchOptions = {};
      if (typeof options['chunkSize'] === 'number') {
        processOptions.chunkSize = options['chunkSize'];
      }
      if (typeof options['skipDuplicates'] === 'boolean') {
        processOptions.skipDuplicates = options['skipDuplicates'];
      }
      const totalsOptions = options['totals'];
      if (totalsOptions) {
        const totals: NonNullable<ProcessCsvBatchOptions['totals']> = {
          totalRecords: typeof totalsOptions['totalRecords'] === 'number' ? totalsOptions['totalRecords'] : totalRecords,
        };

        if (typeof totalsOptions['failedRecords'] === 'number') {
          totals.failedRecords = totalsOptions['failedRecords'];
        }

        processOptions.totals = totals;
      }
      if (options['errorDetails']) {
        processOptions.errorDetails = options['errorDetails'];
      }
      if (typeof options['errorLogs'] !== 'undefined') {
        processOptions.errorLogs = options['errorLogs'];
      }
      if (typeof options['validationWarnings'] !== 'undefined') {
        processOptions.validationWarnings = options['validationWarnings'];
      }

      const completedAt = parseDate(options['completedAt']);
      if (completedAt) {
        processOptions.completedAt = completedAt;
      }

      const importResult = await this.service.processCsvBatch(
        batch.id,
        {
          cases: payload['cases'],
          ...(payload['activities'] ? { activities: payload['activities'] } : {}),
          ...(payload['assignments'] ? { assignments: payload['assignments'] } : {}),
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
