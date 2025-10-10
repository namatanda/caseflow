import multer from 'multer';
import type { RequestHandler } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { config } from '@/config/environment';
import { ApiError } from './errorHandler';

// Ensure temp directory exists
const TEMP_DIR = path.join(process.cwd(), 'temp');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

async function ensureDirectoriesExist() {
  try {
    await fs.access(TEMP_DIR);
  } catch {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }

  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

// Initialize directories
ensureDirectoriesExist().catch(console.error);

// File filter for CSV files
const csvFileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.csv') {
    return cb(new ApiError('Only CSV files are allowed', 400));
  }

  // Check mime type
  const allowedMimes = [
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'text/x-csv',
    'application/x-csv',
    'text/comma-separated-values'
  ];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new ApiError('Invalid file type. Only CSV files are allowed', 400));
  }

  cb(null, true);
};

// Storage configuration for temp files
const tempStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDirectoriesExist()
      .then(() => {
        cb(null, TEMP_DIR);
      })
      .catch((error) => {
        cb(error as Error, TEMP_DIR);
      });
  },
  filename: (_req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

// Multer configuration for CSV uploads
const csvUpload = multer({
  storage: tempStorage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 1, // Only one file per request
  }
});

// Middleware for single CSV file upload
export const uploadCsv: RequestHandler = csvUpload.single('csvFile');

// Cleanup function for temp files
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.warn(`Failed to cleanup temp file ${filePath}:`, error);
  }
}

// Periodic cleanup of old temp files (files older than 1 hour)
export async function cleanupOldTempFiles(): Promise<void> {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      } catch (error) {
        console.warn(`Failed to check/cleanup temp file ${filePath}:`, error);
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup old temp files:', error);
  }
}

// Export temp directory path for use in other modules
export { TEMP_DIR, UPLOADS_DIR };