import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWebSocket } from '../hooks/useWebSocket';
import { useImportStore } from '../store/importStore';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

// Mock import store
vi.mock('../store/importStore', () => ({
  useImportStore: vi.fn(() => ({
    updateProgress: vi.fn(),
    removeImport: vi.fn(),
  })),
}));

describe('useWebSocket', () => {
  let mockSocket: any;
  let mockUpdateProgress: any;
  let mockRemoveImport: any;

  beforeEach(() => {
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    mockUpdateProgress = vi.fn();
    mockRemoveImport = vi.fn();

    (useImportStore as any).mockReturnValue({
      updateProgress: mockUpdateProgress,
      removeImport: mockRemoveImport,
    });

    // Mock io to return our mock socket
    const { io } = require('socket.io-client');
    (io as any).mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize WebSocket connection', () => {
    renderHook(() => useWebSocket());

    const { io } = require('socket.io-client');
    expect(io).toHaveBeenCalledWith('http://localhost:3001', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  });

  it('should set up event listeners', () => {
    renderHook(() => useWebSocket());

    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('import:progress', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('import:completed', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('import:failed', expect.any(Function));
  });

  it('should handle import progress events', () => {
    renderHook(() => useWebSocket());

    // Get the progress event handler
    const progressHandler = mockSocket.on.mock.calls.find(
      (call: any) => call[0] === 'import:progress'
    )[1];

    const mockData = {
      batchId: 'batch-1',
      progress: 50,
      stage: 'parsing',
    };

    act(() => {
      progressHandler(mockData);
    });

    expect(mockUpdateProgress).toHaveBeenCalledWith('batch-1', mockData);
  });

  it('should handle import completed events', () => {
    vi.useFakeTimers();
    renderHook(() => useWebSocket());

    // Get the completed event handler
    const completedHandler = mockSocket.on.mock.calls.find(
      (call: any) => call[0] === 'import:completed'
    )[1];

    const mockData = {
      batchId: 'batch-1',
      progress: 100,
      stage: 'completed',
    };

    act(() => {
      completedHandler(mockData);
    });

    expect(mockUpdateProgress).toHaveBeenCalledWith('batch-1', {
      ...mockData,
      stage: 'completed',
    });

    // Fast-forward time to trigger setTimeout
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockRemoveImport).toHaveBeenCalledWith('batch-1');

    vi.useRealTimers();
  });

  it('should handle import failed events', () => {
    renderHook(() => useWebSocket());

    // Get the failed event handler
    const failedHandler = mockSocket.on.mock.calls.find(
      (call: any) => call[0] === 'import:failed'
    )[1];

    const mockData = {
      batchId: 'batch-1',
      error: 'Import failed',
      stage: 'failed',
    };

    act(() => {
      failedHandler(mockData);
    });

    expect(mockUpdateProgress).toHaveBeenCalledWith('batch-1', {
      ...mockData,
      stage: 'failed',
    });
  });

  it('should subscribe to import batch', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      result.current.subscribeToImport('batch-1');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:batch', 'batch-1');
  });

  it('should disconnect on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket());

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});