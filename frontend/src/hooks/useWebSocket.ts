import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useImportStore } from '@/store/importStore';
import { useAuthStore } from '@/store/authStore';

export const useWebSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const updateProgress = useImportStore((state) => state.updateProgress);
  const removeImport = useImportStore((state) => state.removeImport);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    // Only connect if user is authenticated
    if (!accessToken) {
      return;
    }

    // Backend runs on port 3001
    const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

    socketRef.current = io(WS_URL, {
      path: '/ws', // Match backend WebSocket path
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: {
        token: accessToken,
      },
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
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [updateProgress, removeImport, accessToken]);

  const subscribeToImport = (batchId: string) => {
    socketRef.current?.emit('subscribe:batch', batchId);
  };

  return { subscribeToImport };
};