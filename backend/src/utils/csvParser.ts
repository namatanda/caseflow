import { createReadStream } from 'fs';
import { logger } from './logger';
import { z } from 'zod';

export interface CsvParseOptions {
  /** Maximum number of rows to parse (0 = unlimited) */
  maxRows?: number;
  /** Skip empty rows */
  skipEmptyRows?: boolean;
  /** Custom headers (if CSV doesn't have headers) */
  headers?: string[];
  /** Validate each row with a schema */
  validationSchema?: z.ZodType<unknown>;
  /** Continue parsing on validation errors */
  continueOnError?: boolean;
  /** Custom separator */
  separator?: string;
}

export interface CsvRowError {
  row: number;
data: unknown;
  error: string;
  field?: string;
}

export interface CsvParseResult<T = unknown> {
  /** Successfully parsed rows */
  data: T[];
  /** Rows that failed validation */
  errors: CsvRowError[];
  /** Total rows parsed (including errors) */
  totalRows: number;
  /** Number of successful rows */
  successfulRows: number;
  /** Number of failed rows */
  failedRows: number;
  /** Number of empty rows skipped */
  emptyRowsSkipped: number;
  /** Detected headers */
  headers: string[];
  /** Warnings (non-critical issues) */
  warnings: string[];
}

/**
 * Parse CSV file with validation and error handling
 */
export async function parseCsvFile<T = unknown>(
  filePath: string,
  options: CsvParseOptions = {}
): Promise<CsvParseResult<T>> {
  const {
    maxRows = 0,
    skipEmptyRows = true,
    headers,
    validationSchema,
    continueOnError = true,
    separator = ',',
  } = options;

  const csv = await import('csv-parser');
  
  const data: T[] = [];
  const errors: CsvRowError[] = [];
  const warnings: string[] = [];
  let detectedHeaders: string[] = [];
  let totalRows = 0;
  let emptyRowsSkipped = 0;
  let rowNumber = 0;
  let hasReachedMaxRows = false;

  return new Promise((resolve, reject) => {
    const csvOptions: { separator: string; headers?: string[] } = { separator };
    if (headers) {
      csvOptions.headers = headers;
    }
const stream = createReadStream(filePath);
    
    stream
      .pipe(csv.default(csvOptions))
      .on('headers', (headersList: string[]) => {
        detectedHeaders = headersList;
        logger.debug(`CSV headers detected: ${headersList.join(', ')}`);
      })
      .on('data', (row: unknown) => {
          if (!hasReachedMaxRows) {
            warnings.push(`Maximum row limit of ${maxRows} reached. Remaining rows not processed.`);
            hasReachedMaxRows = true;
          }
          stream.destroy();
          return;
        }

        rowNumber++;
        totalRows++;

        const isEmptyRow = Object.values(row).every(
          (value) => value === '' || value === null || value === undefined
        );

        if (isEmptyRow && skipEmptyRows) {
          emptyRowsSkipped++;
          return;
        }

        if (validationSchema) {
          try {
            const validatedRow = validationSchema.parse(row);
            data.push(validatedRow as T);
          } catch (error) {
            const zodError = error as z.ZodError;
            const errorMessage = zodError.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
            const firstError = zodError.errors[0];
            
            errors.push({
              row: rowNumber,
              data: row,
              error: errorMessage,
              ...(firstError && firstError.path[0] ? { field: firstError.path[0].toString() } : {}),
            });

            if (!continueOnError) {
              stream.destroy();
              reject(new Error(`CSV validation failed at row ${rowNumber}: ${errorMessage}`));
              return;
            }
          }
        } else {
          data.push(row as T);
        }
      })
      .on('end', () => {
        const result: CsvParseResult<T> = {
          data,
          errors,
          totalRows,
          successfulRows: data.length,
          failedRows: errors.length,
          emptyRowsSkipped,
          headers: detectedHeaders,
          warnings,
        };

        logger.info(`CSV parsing completed: ${filePath}`, {
          totalRows: result.totalRows,
          successful: result.successfulRows,
          failed: result.failedRows,
          emptySkipped: result.emptyRowsSkipped,
        });

        resolve(result);
      })
      .on('error', (error: Error) => {
        logger.error(`CSV parsing error: ${filePath}`, error);
        reject(error);
      });
  });
}

/**
 * Validate CSV structure (check if file has expected headers)
 */
export async function validateCsvStructure(
  filePath: string,
  expectedHeaders: string[]
): Promise<{ valid: boolean; missingHeaders: string[]; extraHeaders: string[] }> {
  const csv = await import('csv-parser');
  
  return new Promise((resolve, reject) => {
    const stream: any = createReadStream(filePath);
    
    stream
      .pipe(csv.default())
      .on('headers', (headers: string[]) => {
        const missingHeaders = expectedHeaders.filter(
          (header) => !headers.includes(header)
        );
        const extraHeaders = headers.filter(
          (header) => !expectedHeaders.includes(header)
        );

        resolve({
          valid: missingHeaders.length === 0,
          missingHeaders,
          extraHeaders,
        });

        stream.destroy();
      })
      .on('error', (error: Error) => {
        reject(error);
      });
  });
}

/**
 * Get CSV file statistics without parsing all data
 */
export async function getCsvStats(
  filePath: string
): Promise<{ rowCount: number; headers: string[]; sampleRows: unknown[] }> {
  const csv = await import('csv-parser');
  
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    let detectedHeaders: string[] = [];
    const sampleRows: unknown[] = [];
    const sampleSize = 5;

    const stream: any = createReadStream(filePath);
    
    stream
      .pipe(csv.default())
      .on('headers', (headers: string[]) => {
        detectedHeaders = headers;
      })
      .on('data', (row: unknown) => {
        rowCount++;
        if (sampleRows.length < sampleSize) {
          sampleRows.push(row);
        }
      })
      .on('end', () => {
        resolve({
          rowCount,
          headers: detectedHeaders,
          sampleRows,
        });
      })
      .on('error', (error: Error) => {
        reject(error);
      });
  });
}

/**
 * Detect duplicate rows in CSV based on specific fields
 */
export async function detectDuplicates(
  filePath: string,
  uniqueFields: string[]
): Promise<{ duplicates: Array<{ row: number; data: unknown; duplicateOf: number }> }> {
  const csv = await import('csv-parser');
  const seen = new Map<string, number>();
  const duplicates: Array<{ row: number; data: unknown; duplicateOf: number }> = [];
  let rowNumber = 0;

  return new Promise((resolve, reject) => {
    const stream: any = createReadStream(filePath);
    
    stream
      .pipe(csv.default())
      .on('data', (row: unknown) => {
        rowNumber++;

        const key = uniqueFields.map((field) => row[field] || '').join('|');

        if (seen.has(key)) {
          duplicates.push({
            row: rowNumber,
            data: row,
            duplicateOf: seen.get(key)!,
          });
        } else {
          seen.set(key, rowNumber);
        }
      })
      .on('end', () => {
        resolve({ duplicates });
      })
      .on('error', (error: Error) => {
        reject(error);
      });
  });
}
