import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { 
  sanitizeRequest,
  ipWhitelist,
  requestSizeLimit
} from '@/middleware/security';

// Mock dependencies
vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Security Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      correlationId: 'test-correlation-id',
      ip: '127.0.0.1',
      url: '/api/v1/test',
      method: 'GET',
      query: {},
      body: {},
      get: vi.fn(),
      connection: { remoteAddress: '127.0.0.1' } as any
    };
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('sanitizeRequest', () => {
    it('should sanitize query parameters', () => {
      mockRequest.query = {
        search: '<script>alert("xss")</script>test',
        filter: 'normal text'
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.query.search).toBe('test');
      expect(mockRequest.query.filter).toBe('normal text');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should sanitize request body strings', () => {
      mockRequest.body = {
        name: '<script>alert("xss")</script>John Doe',
        description: 'Normal description',
        nested: {
          value: '<iframe src="evil.com"></iframe>Clean value'
        }
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body.name).toBe('John Doe');
      expect(mockRequest.body.description).toBe('Normal description');
      expect(mockRequest.body.nested.value).toBe('Clean value');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should remove javascript: protocol', () => {
      mockRequest.body = {
        url: 'javascript:alert("xss")',
        link: 'https://example.com'
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body.url).toBe('alert("xss")');
      expect(mockRequest.body.link).toBe('https://example.com');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should remove event handlers', () => {
      mockRequest.body = {
        html: '<div onclick="alert(1)">Click me</div>',
        text: 'onload="evil()" normal text'
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body.html).toBe('<div>Click me</div>');
      expect(mockRequest.body.text).toBe('normal text');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle non-string values without modification', () => {
      mockRequest.body = {
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        nullValue: null
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body.number).toBe(123);
      expect(mockRequest.body.boolean).toBe(true);
      expect(mockRequest.body.array).toEqual([1, 2, 3]);
      expect(mockRequest.body.nullValue).toBe(null);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle errors gracefully', () => {
      // Create a circular reference to cause JSON.stringify to fail
      const circular: any = {};
      circular.self = circular;
      mockRequest.body = circular;

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      // Should still call next even if sanitization fails
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('ipWhitelist', () => {
    it('should allow access from whitelisted IP', () => {
      const allowedIPs = ['127.0.0.1', '192.168.1.1'];
      mockRequest.ip = '127.0.0.1';

      const middleware = ipWhitelist(allowedIPs);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access from non-whitelisted IP', () => {
      const allowedIPs = ['127.0.0.1', '192.168.1.1'];
      mockRequest.ip = '10.0.0.1';

      const middleware = ipWhitelist(allowedIPs);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied from this IP address',
        timestamp: expect.any(String)
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use connection.remoteAddress as fallback', () => {
      const allowedIPs = ['192.168.1.100'];
      mockRequest.ip = undefined;
      mockRequest.connection = { remoteAddress: '192.168.1.100' } as any;

      const middleware = ipWhitelist(allowedIPs);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requestSizeLimit', () => {
    it('should allow requests within size limit', () => {
      const maxSize = 1024; // 1KB
      mockRequest.get = vi.fn().mockReturnValue('512'); // 512 bytes

      const middleware = requestSizeLimit(maxSize);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject requests exceeding size limit', () => {
      const maxSize = 1024; // 1KB
      mockRequest.get = vi.fn().mockReturnValue('2048'); // 2KB

      const middleware = requestSizeLimit(maxSize);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(413);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Request entity too large',
        maxSize: '1024 bytes',
        timestamp: expect.any(String)
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing content-length header', () => {
      const maxSize = 1024;
      mockRequest.get = vi.fn().mockReturnValue(undefined);

      const middleware = requestSizeLimit(maxSize);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should use default max size when not specified', () => {
      mockRequest.get = vi.fn().mockReturnValue('5242880'); // 5MB (within default 10MB)

      const middleware = requestSizeLimit();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});