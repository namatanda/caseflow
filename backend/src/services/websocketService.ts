import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';

export interface ImportProgressPayload {
  batchId: string;
  jobId: string;
  progress: number;
  stage: 'validation' | 'parsing' | 'importing' | 'completed' | 'failed';
  processedRecords?: number;
  totalRecords?: number;
  errors?: number;
  warnings?: number;
  message?: string;
  estimatedTimeRemaining?: number;
}

export interface ImportCompletedPayload {
  batchId: string;
  jobId: string;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  duration: number;
  errorDetails?: unknown[];
}

export interface ImportFailedPayload {
  batchId: string;
  jobId: string;
  error: string;
  timestamp: string;
  stage?: string;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedClients: Map<string, Socket> = new Map();

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.cors.allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/ws',
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    logger.info('WebSocket service initialized');

    return this.io;
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) {
      throw new Error('WebSocket server not initialized');
    }

    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);
      this.connectedClients.set(socket.id, socket);

      // Handle client subscribing to batch updates
      socket.on('subscribe:batch', (batchId: string) => {
        logger.debug(`Client ${socket.id} subscribed to batch: ${batchId}`);
        socket.join(`batch:${batchId}`);
        
        void socket.emit('subscribed', {
          batchId,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle client unsubscribing from batch updates
      socket.on('unsubscribe:batch', (batchId: string) => {
        logger.debug(`Client ${socket.id} unsubscribed from batch: ${batchId}`);
        socket.leave(`batch:${batchId}`);
        
        void socket.emit('unsubscribed', {
          batchId,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle ping/pong for connection health check
      socket.on('ping', () => {
        socket.emit('pong', {
          timestamp: new Date().toISOString(),
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
        this.connectedClients.delete(socket.id);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket error for client ${socket.id}:`, error);
      });
    });

    this.io.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  /**
   * Emit import progress to all subscribers of a batch
   */
  emitImportProgress(payload: ImportProgressPayload): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot emit progress');
      return;
    }

    const room = `batch:${payload.batchId}`;
    this.io.to(room).emit('import:progress', payload);

    logger.debug(`Emitted progress for batch ${payload.batchId}`, {
      progress: payload.progress,
      stage: payload.stage,
    });
  }

  /**
   * Emit import completed event
   */
  emitImportCompleted(payload: ImportCompletedPayload): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot emit completion');
      return;
    }

    const room = `batch:${payload.batchId}`;
    this.io.to(room).emit('import:completed', payload);

    logger.info(`Emitted completion for batch ${payload.batchId}`, {
      successfulRecords: payload.successfulRecords,
      failedRecords: payload.failedRecords,
    });
  }

  /**
   * Emit import failed event
   */
  emitImportFailed(payload: ImportFailedPayload): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot emit failure');
      return;
    }

    const room = `batch:${payload.batchId}`;
    this.io.to(room).emit('import:failed', payload);

    logger.error(`Emitted failure for batch ${payload.batchId}`, {
      error: payload.error,
    });
  }

  /**
   * Broadcast system message to all connected clients
   */
  broadcastSystemMessage(message: string, data?: unknown): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot broadcast');
      return;
    }

    void this.io.emit('system:message', {
      message,
      data,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Broadcasted system message: ${message}`);
  }

  /**
   * Get count of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get count of subscribers for a batch
   */
  getBatchSubscribersCount(batchId: string): number {
    if (!this.io) {
      return 0;
    }

    const room = this.io.sockets.adapter.rooms.get(`batch:${batchId}`);
    return room ? room.size : 0;
  }

  /**
   * Get WebSocket server instance
   */
  getServer(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Close WebSocket server
   */
  async close(): Promise<void> {
    if (this.io) {
      return new Promise<void>((resolve) => {
        this.io!.close(() => {
          logger.info('WebSocket server closed');
          this.io = null;
          this.connectedClients.clear();
          resolve();
        });
      });
    }
    return Promise.resolve();
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
