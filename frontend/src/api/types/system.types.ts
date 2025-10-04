export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  responseTime: number;
}

export interface DetailedHealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime: number;
      details: {
        canConnect: boolean;
        canQuery: boolean;
        responseTime: number;
      };
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime: number;
      details: {
        mainClient: boolean;
        sessionClient: boolean;
        cacheClient: boolean;
        responseTime: number;
      };
    };
    queues: {
      status: 'healthy' | 'unhealthy';
      responseTime: number;
      details: {
        csvImportQueue: boolean;
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
      };
    };
    memory: {
      status: 'healthy' | 'unhealthy';
      usage: {
        used: number;
        total: number;
        percentage: number;
      };
    };
    disk: {
      status: 'healthy' | 'unhealthy';
      usage?: {
        used: number;
        total: number;
        percentage: number;
      };
    };
  };
  errors: string[];
}

export interface MetricsResponse {
  system: {
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    cpu: {
      user: number;
      system: number;
    };
    uptime: number;
    timestamp: string;
    loadAverage: number[];
    freeMemory: number;
    totalMemory: number;
  };
  prometheus: string;
}

export interface VersionResponse {
  name: string;
  version: string;
  apiVersion: string;
  nodeVersion: string;
  environment: string;
  uptime: number;
  buildDate: string;
  platform: string;
  arch: string;
}