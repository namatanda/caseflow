# Design Document: Frontend-Backend Decoupling Migration

## Overview

This document outlines the architectural design for decoupling the CourtFlow frontend from the backend, transforming the current Next.js full-stack application into separate, independently deployable services. The migration will create a standalone Node.js/Express backend API and a framework-agnostic frontend application while maintaining all existing functionality.

## Architecture

### Current Architecture
```
┌─────────────────────────────────────────┐
│           Next.js Full-Stack            │
│  ┌─────────────┐    ┌─────────────────┐ │
│  │  Frontend   │    │   API Routes    │ │
│  │ Components  │◄──►│  /api/*         │ │
│  │             │    │                 │ │
│  └─────────────┘    └─────────────────┘ │
│                            │            │
│                            ▼            │
│                     ┌─────────────────┐ │
│                     │   Prisma ORM    │ │
│                     │   + Business    │ │
│                     │     Logic       │ │
│                     └─────────────────┘ │
└─────────────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   PostgreSQL    │
                  │   + Redis       │
                  │   + BullMQ      │
                  └─────────────────┘
```

### Target Architecture
```
┌─────────────────────┐         ┌─────────────────────┐
│   Frontend App      │         │   Backend API       │
│  (React/Vue/etc.)   │         │  (Node.js/Express)  │
│                     │         │                     │
│  ┌─────────────────┐│  HTTP   │┌─────────────────┐  │
│  │ API Client Lib  ││◄──────►││  REST API       │  │
│  │ - Auth          ││  JSON   ││  - JWT Auth     │  │
│  │ - Error Handling││         ││  - Validation   │  │
│  │ - Retry Logic   ││         ││  - Rate Limiting│  │
│  └─────────────────┘│         │└─────────────────┘  │
│                     │         │         │           │
│  ┌─────────────────┐│         │┌─────────────────┐  │
│  │ State Mgmt      ││         ││ Business Logic  │  │
│  │ - TanStack Query││         ││ - Services      │  │
│  │ - Zustand       ││         ││ - Repositories  │  │
│  │ - Form State    ││         ││ - Operations    │  │
│  └─────────────────┘│         │└─────────────────┘  │
└─────────────────────┘         └─────────────────────┘
                                          │
                                          ▼
                                ┌─────────────────┐
                                │   PostgreSQL    │
                                │   + Redis       │
                                │   + BullMQ      │
                                └─────────────────┘
```

## Components and Interfaces

### Backend API Service

#### Core Structure
```
backend/
├── src/
│   ├── controllers/          # HTTP request handlers
│   ├── services/            # Business logic layer
│   ├── repositories/        # Data access layer
│   ├── middleware/          # Auth, validation, CORS
│   ├── routes/              # API route definitions
│   ├── utils/               # Utility functions
│   ├── types/               # TypeScript definitions
│   └── config/              # Configuration management
├── docs/                    # API documentation
├── tests/                   # Test suites
└── package.json
```

#### Key Components

**1. Express Application Setup**
```typescript
// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
```

**2. API Route Structure**
```
/api/v1/
├── /auth                    # Authentication endpoints
│   ├── POST /login
│   ├── POST /logout
│   ├── POST /refresh
│   └── GET /me
├── /dashboard               # Dashboard analytics
│   ├── GET /analytics
│   ├── GET /metrics
│   └── GET /recent-activity
├── /cases                   # Case management
│   ├── GET /
│   ├── GET /:id
│   ├── POST /
│   ├── PUT /:id
│   └── DELETE /:id
├── /import                  # Data import system
│   ├── POST /upload
│   ├── GET /status/:batchId
│   ├── GET /history
│   └── POST /verify
├── /courts                  # Court management
├── /judges                  # Judge management
├── /case-types             # Case type management
└── /system                 # System endpoints
    ├── GET /health
    ├── GET /metrics
    └── GET /version
```

**3. Authentication Middleware**
```typescript
// src/middleware/auth.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET!, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user as any;
    next();
  });
};
```

**4. Error Handling Middleware**
```typescript
// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Unhandled errors
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
};
```

### Frontend Application

#### Core Structure
```
frontend/
├── src/
│   ├── components/          # UI components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom hooks
│   ├── services/           # API client services
│   ├── stores/             # State management
│   ├── types/              # TypeScript definitions
│   ├── utils/              # Utility functions
│   └── config/             # Configuration
├── public/                 # Static assets
└── package.json
```

#### API Client Library Design

**1. Base API Client**
```typescript
// src/services/api-client.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export class ApiClient {
  private client: AxiosInstance;
  private baseURL: string;
  private authToken: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Handle token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            await this.refreshToken();
            return this.client(originalRequest);
          } catch (refreshError) {
            this.logout();
            throw refreshError;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Retry logic with exponential backoff
  private async retryRequest<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await requestFn();
        return response.data;
      } catch (error) {
        if (attempt === maxRetries) throw error;
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }
}
```

**2. Typed API Services**
```typescript
// src/services/dashboard.service.ts
import { ApiClient } from './api-client';
import { DashboardAnalytics, DashboardFilters } from '../types/dashboard';

export class DashboardService extends ApiClient {
  async getDashboardAnalytics(filters?: DashboardFilters): Promise<DashboardAnalytics> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate.toISOString());
    if (filters?.endDate) params.append('endDate', filters.endDate.toISOString());
    if (filters?.courtId) params.append('courtId', filters.courtId);
    if (filters?.caseTypeId) params.append('caseTypeId', filters.caseTypeId);

    return this.retryRequest(() => 
      this.client.get(`/dashboard/analytics?${params.toString()}`)
    );
  }

  async getRecentActivity(limit: number = 20): Promise<RecentActivity[]> {
    return this.retryRequest(() => 
      this.client.get(`/dashboard/recent-activity?limit=${limit}`)
    );
  }
}
```

**3. State Management Integration**
```typescript
// src/hooks/use-dashboard-data.ts (Updated for API client)
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services';
import { DashboardFilters } from '../types/dashboard';

export function useDashboardData(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => dashboardService.getDashboardAnalytics(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    onError: (error) => {
      console.error('Dashboard data fetch failed:', error);
      // Handle error (show toast, etc.)
    }
  });
}
```

## Data Models

### API Response Formats

**1. Standard Response Wrapper**
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**2. Dashboard Analytics Model**
```typescript
interface DashboardAnalytics {
  totalCases: number;
  activeCases: number;
  resolvedCases: number;
  pendingCases: number;
  transferredCases: number;
  clearanceRate: number;
  averageCaseAge: number;
  caseAgeDistribution: Record<string, number>;
  casesByType: CaseTypeBreakdown[];
  casesByStatus: StatusBreakdown[];
  monthlyTrends: MonthlyTrend[];
  courtWorkload: CourtWorkload[];
  recentActivity: RecentActivity[];
}
```

**3. Authentication Models**
```typescript
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}
```

## Error Handling

### Backend Error Strategy

**1. Error Classification**
```typescript
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  CONFLICT = 'CONFLICT_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  DATABASE = 'DATABASE_ERROR',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL = 'INTERNAL_ERROR'
}

export class ApiError extends Error {
  constructor(
    public type: ErrorType,
    public message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
  }
}
```

**2. Global Error Handler**
```typescript
export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errorId = generateErrorId();
  
  // Log error with correlation ID
  logger.error('API Error', {
    errorId,
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id
  });

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      type: err.type,
      errorId,
      ...(err.details && { details: err.details })
    });
  }

  // Unhandled errors
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    type: ErrorType.INTERNAL,
    errorId
  });
};
```

### Frontend Error Strategy

**1. Error Boundary Component**
```typescript
// src/components/ErrorBoundary.tsx
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to error reporting service
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**2. API Error Handling Hook**
```typescript
// src/hooks/use-error-handler.ts
import { useCallback } from 'react';
import { toast } from '../components/ui/use-toast';

export function useErrorHandler() {
  const handleError = useCallback((error: any) => {
    const message = error.response?.data?.error || error.message || 'An error occurred';
    const errorType = error.response?.data?.type || 'UNKNOWN';
    
    // Show user-friendly error messages
    switch (errorType) {
      case 'VALIDATION_ERROR':
        toast({
          title: 'Validation Error',
          description: message,
          variant: 'destructive'
        });
        break;
      case 'AUTHENTICATION_ERROR':
        toast({
          title: 'Authentication Required',
          description: 'Please log in to continue',
          variant: 'destructive'
        });
        // Redirect to login
        break;
      default:
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive'
        });
    }
  }, []);

  return { handleError };
}
```

## Testing Strategy

### Backend Testing

**1. Unit Tests**
```typescript
// tests/unit/services/dashboard.service.test.ts
import { DashboardService } from '../../../src/services/dashboard.service';
import { mockPrisma } from '../../mocks/prisma';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
  });

  describe('getDashboardAnalytics', () => {
    it('should return dashboard analytics with correct structure', async () => {
      // Mock data
      mockPrisma.case.count.mockResolvedValue(100);
      mockPrisma.case.groupBy.mockResolvedValue([
        { status: 'ACTIVE', _count: { id: 60 } },
        { status: 'RESOLVED', _count: { id: 40 } }
      ]);

      const result = await service.getDashboardAnalytics();

      expect(result).toHaveProperty('totalCases', 100);
      expect(result).toHaveProperty('activeCases', 60);
      expect(result).toHaveProperty('resolvedCases', 40);
    });
  });
});
```

**2. Integration Tests**
```typescript
// tests/integration/api/dashboard.test.ts
import request from 'supertest';
import { app } from '../../../src/app';
import { setupTestDb, cleanupTestDb } from '../../helpers/database';

describe('Dashboard API', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/v1/dashboard/analytics', () => {
    it('should return dashboard analytics', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/analytics')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalCases');
      expect(response.body.data).toHaveProperty('activeCases');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v1/dashboard/analytics')
        .expect(401);
    });
  });
});
```

### Frontend Testing

**1. Component Tests**
```typescript
// src/components/__tests__/Dashboard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../Dashboard';
import { mockDashboardService } from '../../__mocks__/services';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Dashboard', () => {
  it('should display dashboard metrics', async () => {
    mockDashboardService.getDashboardAnalytics.mockResolvedValue({
      totalCases: 100,
      activeCases: 60,
      resolvedCases: 40,
      // ... other properties
    });

    render(<Dashboard />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Total Cases')).toBeInTheDocument();
    });
  });
});
```

**2. API Client Tests**
```typescript
// src/services/__tests__/dashboard.service.test.ts
import { DashboardService } from '../dashboard.service';
import { mockAxios } from '../../__mocks__/axios';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService('http://localhost:3001/api/v1');
  });

  it('should fetch dashboard analytics', async () => {
    const mockData = { totalCases: 100, activeCases: 60 };
    mockAxios.get.mockResolvedValue({ data: { success: true, data: mockData } });

    const result = await service.getDashboardAnalytics();

    expect(result).toEqual(mockData);
    expect(mockAxios.get).toHaveBeenCalledWith('/dashboard/analytics?');
  });

  it('should retry on failure', async () => {
    mockAxios.get
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({ data: { success: true, data: {} } });

    await service.getDashboardAnalytics();

    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  });
});
```

## Migration Strategy

### Phase 1: Backend API Creation (Weeks 1-3)
1. Set up Express.js application structure
2. Migrate existing API routes from Next.js to Express
3. Implement authentication middleware
4. Add comprehensive error handling
5. Create OpenAPI documentation
6. Set up testing infrastructure

### Phase 2: API Client Library (Weeks 2-4)
1. Create base API client with interceptors
2. Implement retry logic and error handling
3. Add TypeScript definitions
4. Create service-specific clients
5. Add comprehensive testing

### Phase 3: Frontend Migration (Weeks 4-6)
1. Replace direct database calls with API calls
2. Update state management to use API client
3. Implement proper loading states
4. Add optimistic updates where appropriate
5. Update error handling throughout the application

### Phase 4: Testing & Deployment (Weeks 6-8)
1. End-to-end testing of decoupled architecture
2. Performance testing and optimization
3. Set up separate deployment pipelines
4. Monitoring and logging implementation
5. Documentation and training

### Phase 5: Production Migration (Weeks 8-10)
1. Blue-green deployment strategy
2. Database migration if needed
3. DNS and load balancer configuration
4. Monitoring and alerting setup
5. Rollback procedures

## Deployment Architecture

### Backend Deployment
```yaml
# docker-compose.backend.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/system/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Frontend Deployment
```yaml
# docker-compose.frontend.yml
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    environment:
      - REACT_APP_API_URL=${API_URL}
      - REACT_APP_ENV=production
    depends_on:
      - backend
```

### Load Balancer Configuration
```nginx
# nginx.conf
upstream backend {
    server backend:3001;
}

upstream frontend {
    server frontend:80;
}

server {
    listen 80;
    server_name courtflow.example.com;

    # Frontend routes
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API routes
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Monitoring and Observability

### Backend Monitoring
```typescript
// src/middleware/monitoring.ts
import { Request, Response, NextFunction } from 'express';
import { register, Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route']
});

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    
    httpRequestsTotal
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .inc();
    
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path)
      .observe(duration);
  });
  
  next();
};
```

### Health Check Endpoints
```typescript
// src/routes/system.ts
import { Router } from 'express';
import { prisma } from '../config/database';
import { redis } from '../config/redis';

const router = Router();

router.get('/health', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    timestamp: new Date().toISOString()
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }

  const isHealthy = checks.database && checks.redis;
  
  res.status(isHealthy ? 200 : 503).json({
    healthy: isHealthy,
    checks
  });
});

export default router;
```

This design provides a comprehensive blueprint for decoupling the CourtFlow frontend from the backend while maintaining all existing functionality and ensuring the system can support multiple frontend frameworks in the future.