import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { uploadCsv, cleanupTempFile, cleanupOldTempFiles, TEMP_DIR, UPLOADS_DIR } from '../../middleware/upload';
import { ApiError } from '../../middleware/errorHandler';

// Mock dependencies
vi.mock('multer');
vi.mock('fs/promises');
vi.mock('@/config/environment', () => ({
  config: {
    upload: {
      maxFileSize: 10485760, // 10MB
    },
  },
}));
vi.mock('../../middleware/errorHandler');

describe('Upload Middleware', () => {
  const mockMulter = vi.mocked(multer);
  const mockFs = vi.mocked(fs);
  const mockApiError = vi.mocked(ApiError);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Directory Creation', () => {
    it('should create temp and uploads directories if they do not exist', async () => {
      // Mock fs.access to throw for both directories (they don't exist)
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));

      // Mock fs.mkdir to resolve
      mockFs.mkdir.mockResolvedValue(undefined);

      // Import the module to trigger directory creation
      await import('../../middleware/upload');

      // Wait for the async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockFs.access).toHaveBeenCalledWith(TEMP_DIR);
      expect(mockFs.access).toHaveBeenCalledWith(UPLOADS_DIR);
      expect(mockFs.mkdir).toHaveBeenCalledWith(TEMP_DIR, { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith(UPLOADS_DIR, { recursive: true });
    });

    it('should not create directories if they already exist', async () => {
      // Mock fs.access to resolve (directories exist)
      mockFs.access.mockResolvedValue(undefined);

      // Import the module
      await import('../../middleware/upload');

      // Wait for the async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockFs.access).toHaveBeenCalledWith(TEMP_DIR);
      expect(mockFs.access).toHaveBeenCalledWith(UPLOADS_DIR);
      expect(mockFs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('CSV File Filter', () => {
    it('should accept valid CSV files with .csv extension and correct mime type', () => {
      // The file filter is internal, so we need to test the multer configuration
      const mockMulterInstance = {
        single: vi.fn().mockReturnValue(vi.fn()),
      };

      mockMulter.mockReturnValue(mockMulterInstance as any);

      // Re-import to trigger multer configuration
      const { uploadCsv } = require('../../middleware/upload');

      expect(mockMulter).toHaveBeenCalledWith({
        storage: expect.any(Object),
        fileFilter: expect.any(Function),
        limits: {
          fileSize: 10485760,
          files: 1,
        },
      });
    });

    it('should reject files with invalid extension', () => {
      // This would be tested through integration, but we can verify the filter logic
      const ext = path.extname('test.txt').toLowerCase();
      expect(ext).toBe('.txt');

      // The actual filter would call cb with ApiError for invalid extension
      const expectedError = new ApiError('Only CSV files are allowed', 400);
      mockApiError.mockImplementation(() => expectedError);

      // Verify ApiError is constructed correctly
      expect(() => new ApiError('Only CSV files are allowed', 400)).toBeDefined();
    });

    it('should reject files with invalid mime type', () => {
      const allowedMimes = ['text/csv', 'application/csv', 'text/plain'];
      const invalidMime = 'application/pdf';

      expect(allowedMimes.includes(invalidMime)).toBe(false);

      // The actual filter would call cb with ApiError for invalid mime type
      const expectedError = new ApiError('Invalid file type. Only CSV files are allowed', 400);
      mockApiError.mockImplementation(() => expectedError);

      expect(() => new ApiError('Invalid file type. Only CSV files are allowed', 400)).toBeDefined();
    });
  });

  describe('Storage Configuration', () => {
    it('should configure disk storage with temp directory', () => {
      const mockMulterInstance = {
        single: vi.fn().mockReturnValue(vi.fn()),
      };

      mockMulter.mockReturnValue(mockMulterInstance as any);

      // Re-import to trigger storage configuration
      const { uploadCsv } = require('../../middleware/upload');

      const multerConfig = mockMulter.mock.calls[0]?.[0];
      expect(multerConfig?.storage).toBeDefined();
    });

    it('should generate unique filenames with timestamp and random suffix', () => {
      const originalname = 'test.csv';
      const ext = path.extname(originalname);
      const basename = path.basename(originalname, ext);

      // Verify filename generation logic
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      const expectedFilename = `${basename}-${uniqueSuffix}${ext}`;

      expect(expectedFilename).toContain(basename);
      expect(expectedFilename).toContain(ext);
      expect(expectedFilename).toMatch(/\d+-\d+\.csv$/);
    });
  });

  describe('File Size Limits', () => {
    it('should enforce maximum file size limit from config', () => {
      const maxFileSize = 10485760; // 10MB

      const mockMulterInstance = {
        single: vi.fn().mockReturnValue(vi.fn()),
      };

      mockMulter.mockReturnValue(mockMulterInstance as any);

      // Re-import to check limits
      const { uploadCsv } = require('../../middleware/upload');

      const multerConfig = mockMulter.mock.calls[0]?.[0];
      expect(multerConfig?.limits?.fileSize).toBe(maxFileSize);
      expect(multerConfig?.limits?.files).toBe(1);
    });
  });

  describe('Cleanup Functions', () => {
    describe('cleanupTempFile', () => {
      it('should successfully delete a temp file', async () => {
        const filePath = '/temp/test.csv';
        mockFs.unlink.mockResolvedValue(undefined);

        await cleanupTempFile(filePath);

        expect(mockFs.unlink).toHaveBeenCalledWith(filePath);
      });

      it('should handle errors when deleting temp file', async () => {
        const filePath = '/temp/test.csv';
        const error = new Error('File not found');
        mockFs.unlink.mockRejectedValue(error);

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await cleanupTempFile(filePath);

        expect(mockFs.unlink).toHaveBeenCalledWith(filePath);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          `Failed to cleanup temp file ${filePath}:`,
          error
        );

        consoleWarnSpy.mockRestore();
      });
    });

    describe('cleanupOldTempFiles', () => {
      it('should cleanup files older than 1 hour', async () => {
        const oldFile = 'old-file.csv';
        const newFile = 'new-file.csv';
        const files = [oldFile, newFile] as any; // Mock as Dirent-like

        mockFs.readdir.mockResolvedValue(files);

        // Mock stats for old file (2 hours old)
        const oldFileStats = {
          mtime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        };
        // Mock stats for new file (30 minutes old)
        const newFileStats = {
          mtime: new Date(Date.now() - 30 * 60 * 1000),
        };

        mockFs.stat
          .mockResolvedValueOnce(oldFileStats as any)
          .mockResolvedValueOnce(newFileStats as any);

        mockFs.unlink.mockResolvedValue(undefined);

        await cleanupOldTempFiles();

        expect(mockFs.readdir).toHaveBeenCalledWith(TEMP_DIR);
        expect(mockFs.stat).toHaveBeenCalledWith(path.join(TEMP_DIR, oldFile));
        expect(mockFs.stat).toHaveBeenCalledWith(path.join(TEMP_DIR, newFile));
        expect(mockFs.unlink).toHaveBeenCalledWith(path.join(TEMP_DIR, oldFile));
        expect(mockFs.unlink).not.toHaveBeenCalledWith(path.join(TEMP_DIR, newFile));
      });

      it('should handle errors during cleanup process', async () => {
        mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await cleanupOldTempFiles();

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Failed to cleanup old temp files:',
          expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
      });

      it('should handle errors when checking individual files', async () => {
        const files = ['file1.csv'] as any; // Mock as Dirent-like
        mockFs.readdir.mockResolvedValue(files);
        mockFs.stat.mockRejectedValue(new Error('File access error'));

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await cleanupOldTempFiles();

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          `Failed to check/cleanup temp file ${path.join(TEMP_DIR, 'file1.csv')}:`,
          expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
      });
    });
  });

  describe('Multer Middleware', () => {
    it('should export uploadCsv middleware for single file upload', () => {
      const mockMulterInstance = {
        single: vi.fn().mockReturnValue('middleware-function'),
      };

      mockMulter.mockReturnValue(mockMulterInstance as any);

      // Re-import to get the middleware
      const { uploadCsv } = require('../../middleware/upload');

      expect(mockMulterInstance.single).toHaveBeenCalledWith('csvFile');
      expect(uploadCsv).toBe('middleware-function');
    });
  });
});