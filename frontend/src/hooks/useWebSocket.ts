import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useImportStore } from '@/store/importStore';

export const useWebSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const updateProgress = useImportStore((state) => state.updateProgress);
  const removeImport = useImportStore((state) => state.removeImport);

  useEffect(() => {
    // Backend runs on port 3001
    const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

    socketRef.current = io(WS_URL, {
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection events
    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
    });

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // Listen for import progress
    socketRef.current.on('import:progress', (data) => {
      console.log('Import progress:', data);
      updateProgress(data.batchId, data);
    });

    // Listen for completion
    socketRef.current.on('import:completed', (data) => {
      console.log('Import completed:', data);
      updateProgress(data.batchId, { ...data, stage: 'completed' as const });
      // Remove from active imports after delay
      setTimeout(() => removeImport(data.batchId), 5000);
    });

    // Listen for failures
    socketRef.current.on('import:failed', (data) => {
      console.error('Import failed:', data);
      updateProgress(data.batchId, { ...data, stage: 'failed' as const });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [updateProgress, removeImport]);

  const subscribeToImport = (batchId: string) => {
    socketRef.current?.emit('subscribe:batch', batchId);
  };

  return { subscribeToImport };
};