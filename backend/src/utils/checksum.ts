import crypto from 'crypto';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { logger } from './logger';

export type ChecksumAlgorithm = 'md5' | 'sha256' | 'sha512';

export interface ChecksumResult {
  algorithm: ChecksumAlgorithm;
  checksum: string;
  fileSize: number;
  computeTime: number;
}

/**
 * Calculate checksum for a file using streams (memory-efficient for large files)
 */
export async function calculateFileChecksum(
  filePath: string,
  algorithm: ChecksumAlgorithm = 'md5'
): Promise<ChecksumResult> {
  const startTime = Date.now();

  try {
    const hash = crypto.createHash(algorithm);
    const stream = createReadStream(filePath);

    // Get file size
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        const checksum = hash.digest('hex');
        const computeTime = Date.now() - startTime;

        logger.debug(`Calculated ${algorithm} checksum for ${filePath}`, {
          checksum,
          fileSize,
          computeTime,
        });

        resolve({
          algorithm,
          checksum,
          fileSize,
          computeTime,
        });
      });

      stream.on('error', (error) => {
        logger.error(`Error calculating checksum for ${filePath}:`, error);
        reject(error);
      });
    });
  } catch (error) {
    logger.error(`Failed to calculate checksum for ${filePath}:`, error);
    throw error;
  }
}

/**
 * Calculate checksum from a buffer (for in-memory data)
 */
export function calculateBufferChecksum(
  buffer: Buffer,
  algorithm: ChecksumAlgorithm = 'md5'
): string {
  const hash = crypto.createHash(algorithm);
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Calculate checksum from a string
 */
export function calculateStringChecksum(
  data: string,
  algorithm: ChecksumAlgorithm = 'md5'
): string {
  const hash = crypto.createHash(algorithm);
  hash.update(data, 'utf8');
  return hash.digest('hex');
}

/**
 * Verify if a file matches a given checksum
 */
export async function verifyFileChecksum(
  filePath: string,
  expectedChecksum: string,
  algorithm: ChecksumAlgorithm = 'md5'
): Promise<boolean> {
  try {
    const result = await calculateFileChecksum(filePath, algorithm);
    return result.checksum === expectedChecksum.toLowerCase();
  } catch (error) {
    logger.error(`Failed to verify checksum for ${filePath}:`, error);
    return false;
  }
}

/**
 * Calculate multiple checksums for a file simultaneously
 */
export async function calculateMultipleChecksums(
  filePath: string,
  algorithms: ChecksumAlgorithm[] = ['md5', 'sha256']
): Promise<Record<ChecksumAlgorithm, string>> {
  const startTime = Date.now();

  try {
    const hashes = algorithms.map((alg) => ({
      algorithm: alg,
      hash: crypto.createHash(alg),
    }));

    const stream = createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        hashes.forEach(({ hash }) => hash.update(chunk));
      });

      stream.on('end', () => {
        const result = hashes.reduce(
          (acc, { algorithm, hash }) => {
            acc[algorithm] = hash.digest('hex');
            return acc;
          },
          {} as Record<ChecksumAlgorithm, string>
        );

        const computeTime = Date.now() - startTime;
        logger.debug(`Calculated multiple checksums for ${filePath}`, {
          algorithms,
          computeTime,
        });

        resolve(result);
      });

      stream.on('error', (error) => {
        logger.error(`Error calculating checksums for ${filePath}:`, error);
        reject(error);
      });
    });
  } catch (error) {
    logger.error(`Failed to calculate multiple checksums for ${filePath}:`, error);
    throw error;
  }
}
