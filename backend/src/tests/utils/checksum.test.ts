import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateFileChecksum, calculateBufferChecksum, calculateStringChecksum, verifyFileChecksum, calculateMultipleChecksums } from '../../utils/checksum';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

// Mock fs and logger
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Checksum Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateFileChecksum', () => {
    it('should calculate MD5 checksum for a file', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('test content'));
          } else if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);
      vi.mocked(fs.stat).mockResolvedValue({ size: 12 } as any);

      const result = await calculateFileChecksum('/test/file.txt', 'md5');

      expect(result).toHaveProperty('checksum');
      expect(result).toHaveProperty('fileSize', 12);
      expect(result).toHaveProperty('algorithm', 'md5');
      expect(result).toHaveProperty('computeTime');
    });

    it('should calculate SHA256 checksum for a file', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('test'));
          } else if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);
      vi.mocked(fs.stat).mockResolvedValue({ size: 4 } as any);

      const result = await calculateFileChecksum('/test/file.txt', 'sha256');

      expect(result.algorithm).toBe('sha256');
      expect(result.checksum).toBeDefined();
    });

    it('should handle file read errors', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('File not found')), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      await expect(calculateFileChecksum('/nonexistent/file.txt')).rejects.toThrow();
    });
  });

  describe('calculateBufferChecksum', () => {
    it('should calculate MD5 checksum from buffer', () => {
      const buffer = Buffer.from('test content');
      const checksum = calculateBufferChecksum(buffer, 'md5');

      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
      expect(checksum).toMatch(/^[a-f0-9]{32}$/); // MD5 is 32 hex chars
    });

    it('should calculate SHA256 checksum from buffer', () => {
      const buffer = Buffer.from('test content');
      const checksum = calculateBufferChecksum(buffer, 'sha256');

      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
      expect(checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256 is 64 hex chars
    });

    it('should produce consistent checksums for same content', () => {
      const buffer = Buffer.from('consistent test');
      const checksum1 = calculateBufferChecksum(buffer, 'md5');
      const checksum2 = calculateBufferChecksum(buffer, 'md5');

      expect(checksum1).toBe(checksum2);
    });
  });

  describe('calculateStringChecksum', () => {
    it('should calculate checksum from string', () => {
      const checksum = calculateStringChecksum('test string', 'md5');

      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
    });

    it('should handle unicode strings', () => {
      const checksum = calculateStringChecksum('测试字符串 🚀', 'md5');

      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
    });

    it('should produce different checksums for different algorithms', () => {
      const text = 'same text';
      const md5 = calculateStringChecksum(text, 'md5');
      const sha256 = calculateStringChecksum(text, 'sha256');

      expect(md5).not.toBe(sha256);
      expect(md5.length).toBe(32);
      expect(sha256.length).toBe(64);
    });
  });

  describe('verifyFileChecksum', () => {
    it('should verify matching checksum', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('test'));
          } else if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);
      vi.mocked(fs.stat).mockResolvedValue({ size: 4 } as any);

      const expectedChecksum = '098f6bcd4621d373cade4e832627b4f6'; // MD5 of 'test'
      const result = await verifyFileChecksum('/test/file.txt', expectedChecksum, 'md5');

      expect(result).toBe(true);
    });

    it('should return false for non-matching checksum', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('different'));
          } else if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);
      vi.mocked(fs.stat).mockResolvedValue({ size: 9 } as any);

      const wrongChecksum = 'wrongchecksumvalue';
      const result = await verifyFileChecksum('/test/file.txt', wrongChecksum, 'md5');

      expect(result).toBe(false);
    });

    it('should handle verification errors gracefully', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('Read error')), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await verifyFileChecksum('/test/file.txt', 'anyChecksum');

      expect(result).toBe(false);
    });
  });

  describe('calculateMultipleChecksums', () => {
    it('should calculate multiple checksums simultaneously', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('test'));
          } else if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await calculateMultipleChecksums('/test/file.txt', ['md5', 'sha256']);

      expect(result).toHaveProperty('md5');
      expect(result).toHaveProperty('sha256');
      expect(typeof result.md5).toBe('string');
      expect(typeof result.sha256).toBe('string');
    });

    it('should handle custom algorithm combinations', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('content'));
          } else if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const result = await calculateMultipleChecksums('/test/file.txt', ['md5', 'sha256', 'sha512']);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result).toHaveProperty('md5');
      expect(result).toHaveProperty('sha256');
      expect(result).toHaveProperty('sha512');
    });

    it('should handle stream errors', async () => {
      const mockStream = {
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('Stream error')), 0);
          }
          return mockStream;
        }),
      };

      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      await expect(
        calculateMultipleChecksums('/test/file.txt', ['md5', 'sha256'])
      ).rejects.toThrow();
    });
  });
});
