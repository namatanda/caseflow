import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { apiClient, handleApiError } from '../api/client';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
    isAxiosError: vi.fn(),
  },
}));

describe('apiClient', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    };

    (axios.create as any).mockReturnValue(mockAxiosInstance);
  });

  it('should create axios instance with correct config', () => {
    // Import to trigger the creation
    require('../api/client');

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'http://localhost:3001/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      withCredentials: false,
    });
  });

  it('should set up request interceptor', () => {
    require('../api/client');

    expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
  });

  it('should set up response interceptor', () => {
    require('../api/client');

    expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
  });
});

describe('handleApiError', () => {
  it('should handle axios errors', () => {
    const mockError = {
      response: {
        data: { message: 'Server error' },
      },
      message: 'Request failed',
    };

    (axios.isAxiosError as any).mockReturnValue(true);

    const result = handleApiError(mockError);
    expect(result).toBe('Server error');
  });

  it('should handle axios errors without response data', () => {
    const mockError = {
      response: null,
      message: 'Network error',
    };

    (axios.isAxiosError as any).mockReturnValue(true);

    const result = handleApiError(mockError);
    expect(result).toBe('Network error');
  });

  it('should handle non-axios errors', () => {
    const error = new Error('Some error');

    (axios.isAxiosError as any).mockReturnValue(false);

    const result = handleApiError(error);
    expect(result).toBe('Some error');
  });

  it('should handle unknown errors', () => {
    const result = handleApiError('string error');
    expect(result).toBe('An unknown error occurred');
  });
});