# React UI Development Plan for CourtFlow Backend

## Overview
Systematic plan for developing a React UI to consume all backend endpoints with proper architecture, state management, and user experience.

---

## Phase 1: Project Setup & Architecture (Week 1)

### 1.1 Core Dependencies Installation

**✅ STATUS: All core dependencies already installed!**

The frontend already has all required dependencies installed:
- ✅ `@tanstack/react-query` v5.90.2
- ✅ `axios` v1.12.2
- ✅ `zustand` v5.0.8
- ✅ `react-router-dom` v7.9.3
- ✅ `@mui/material` v7.3.4 + `@mui/icons-material` v7.3.4
- ✅ `@emotion/react` v11.14.0 + `@emotion/styled` v11.14.1
- ✅ `react-hook-form` v7.64.0
- ✅ `zod` v4.1.11
- ✅ `@hookform/resolvers` v5.2.2
- ✅ `socket.io-client` v4.8.1
- ✅ `date-fns` v4.1.0
- ✅ `clsx` v2.1.1
- ✅ `@types/socket.io-client` v1.4.36 (dev)

**Additional Optional Dependencies:**
```bash
# Charts (if needed for analytics)
npm install recharts

# Testing (recommended)
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom

# E2E Testing (recommended)
npm install -D @playwright/test
```

### 1.2 Project Structure
```
frontend/src/
├── api/                      # API client & endpoints
│   ├── client.ts            # Axios instance with interceptors
│   ├── endpoints/
│   │   ├── auth.ts          # Auth endpoints
│   │   ├── import.ts        # Import endpoints
│   │   └── system.ts        # System endpoints
│   └── types/               # API request/response types
│       ├── auth.types.ts
│       ├── import.types.ts
│       └── system.types.ts
│
├── components/              # Reusable components
│   ├── common/             # Shared components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   ├── Spinner.tsx
│   │   └── ProgressBar.tsx
│   ├── layout/             # Layout components
│   │   ├── AppLayout.tsx
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── Footer.tsx
│   └── forms/              # Form components
│       ├── LoginForm.tsx
│       ├── RegisterForm.tsx
│       └── CsvUploadForm.tsx
│
├── features/               # Feature-based modules
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── store/
│   ├── import/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── store/
│   └── system/
│       ├── components/
│       ├── hooks/
│       └── pages/
│
├── hooks/                  # Custom hooks
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   ├── useFileUpload.ts
│   └── useDebounce.ts
│
├── lib/                    # Utilities & helpers
│   ├── constants.ts
│   ├── format.ts
│   ├── validation.ts
│   └── storage.ts
│
├── routes/                 # Route configuration
│   ├── index.tsx
│   ├── ProtectedRoute.tsx
│   └── PublicRoute.tsx
│
├── store/                  # Global state (Zustand)
│   ├── authStore.ts
│   ├── importStore.ts
│   └── uiStore.ts
│
├── styles/                 # Global styles
│   ├── globals.css
│   ├── variables.css
│   └── theme.ts
│
├── App.tsx
└── main.tsx
```

### 1.3 API Client Setup
**File: `src/api/client.ts`**
```typescript
import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

// Backend runs on port 3001 by default
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
  withCredentials: false,
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor - Handle errors & token refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Token expired - attempt refresh
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
        
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        // Redirect to login only if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Export error handler helper
export const handleApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'An error occurred';
  }
  return error instanceof Error ? error.message : 'An unknown error occurred';
};
```

---

## Phase 2: Authentication Module (Week 2)

### 2.1 Auth Store (Zustand)
**File: `src/store/authStore.ts`**
```typescript
import { create } from 'zustand';
import { persist, PersistOptions } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'DATA_ENTRY' | 'VIEWER';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken, isAuthenticated: true }),
      setUser: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        // Clear local storage
        localStorage.removeItem('auth-storage');
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    } as PersistOptions<AuthState>
  )
);
```

### 2.2 Auth API Endpoints
**File: `src/api/endpoints/auth.ts`**
```typescript
import { apiClient } from '../client';
import type { AxiosResponse } from 'axios';

// Type definitions for API responses
interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'DATA_ENTRY' | 'VIEWER';
  };
}

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'DATA_ENTRY' | 'VIEWER';
  };
}

interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'DATA_ENTRY' | 'VIEWER';
  createdAt: string;
  updatedAt: string;
}

export const authAPI = {
  login: (email: string, password: string): Promise<AxiosResponse<LoginResponse>> =>
    apiClient.post('/auth/login', { email, password }),

  register: (data: { 
    email: string; 
    password: string; 
    name: string;
  }): Promise<AxiosResponse<RegisterResponse>> =>
    apiClient.post('/auth/register', data),

  logout: (): Promise<AxiosResponse<{ message: string }>> => 
    apiClient.post('/auth/logout'),

  getProfile: (): Promise<AxiosResponse<ProfileResponse>> => 
    apiClient.get('/auth/me'),

  changePassword: (
    currentPassword: string, 
    newPassword: string
  ): Promise<AxiosResponse<{ message: string }>> =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),

  refreshToken: (refreshToken: string): Promise<AxiosResponse<{
    accessToken: string;
    refreshToken: string;
  }>> =>
    apiClient.post('/auth/refresh', { refreshToken }),

  forgotPassword: (email: string): Promise<AxiosResponse<{ message: string }>> =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (
    token: string,
    newPassword: string
  ): Promise<AxiosResponse<{ message: string }>> =>
    apiClient.post('/auth/reset-password', { token, newPassword }),
};
```

### 2.3 Auth Pages
- **LoginPage**: Email/password form with error handling
- **RegisterPage**: Registration form with validation
- **ProfilePage**: Display user info, change password
- **ForgotPasswordPage**: Password reset request

### 2.4 Protected Routes
**File: `src/routes/ProtectedRoute.tsx`**
```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
```

---

## Phase 3: CSV Import Module (Week 3-4)

### 3.1 Import Store
**File: `src/store/importStore.ts`**
```typescript
import { create } from 'zustand';

export type ImportStage = 'queued' | 'validation' | 'parsing' | 'importing' | 'completed' | 'failed';

export interface ImportProgress {
  batchId: string;
  jobId: string;
  progress: number;
  stage: ImportStage;
  processedRecords?: number;
  totalRecords?: number;
  validRecords?: number;
  invalidRecords?: number;
  message?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BatchInfo {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRecords: number;
  processedRecords: number;
  validRecords: number;
  invalidRecords: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface ImportState {
  activeImports: Map<string, ImportProgress>;
  recentBatches: BatchInfo[];
  updateProgress: (batchId: string, progress: ImportProgress) => void;
  removeImport: (batchId: string) => void;
  setRecentBatches: (batches: BatchInfo[]) => void;
  addBatch: (batch: BatchInfo) => void;
  clearActiveImports: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
  activeImports: new Map(),
  recentBatches: [],
  
  updateProgress: (batchId, progress) =>
    set((state) => ({
      activeImports: new Map(state.activeImports).set(batchId, progress),
    })),
  
  removeImport: (batchId) =>
    set((state) => {
      const newMap = new Map(state.activeImports);
      newMap.delete(batchId);
      return { activeImports: newMap };
    }),
  
  setRecentBatches: (batches) => set({ recentBatches: batches }),
  
  addBatch: (batch) =>
    set((state) => ({
      recentBatches: [batch, ...state.recentBatches].slice(0, 50), // Keep last 50
    })),
  
  clearActiveImports: () => set({ activeImports: new Map() }),
}));
```

### 3.2 WebSocket Hook
**File: `src/hooks/useWebSocket.ts`**
```typescript
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
```

### 3.3 Import API Endpoints
**File: `src/api/endpoints/import.ts`**
```typescript
import { apiClient } from '../client';
import type { AxiosResponse } from 'axios';
import type { BatchInfo } from '@/store/importStore';

interface UploadResponse {
  batchId: string;
  jobId: string;
  fileName: string;
  fileSize: number;
  checksum: {
    md5: string;
    sha256: string;
  };
  message: string;
}

interface BatchStatusResponse {
  id: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRecords: number;
  processedRecords: number;
  validRecords: number;
  invalidRecords: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  jobs: Array<{
    id: string;
    status: string;
    progress: number;
    startedAt?: string;
    completedAt?: string;
  }>;
}

interface JobStatusResponse {
  id: string;
  batchId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  data?: any;
  returnvalue?: any;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}

export const importAPI = {
  uploadCsv: (
    file: File, 
    metadata?: Record<string, unknown>
  ): Promise<AxiosResponse<UploadResponse>> => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    return apiClient.post('/import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getBatchStatus: (batchId: string): Promise<AxiosResponse<BatchStatusResponse>> =>
    apiClient.get(`/import/batch/${batchId}`),

  getJobStatus: (batchId: string, jobId: string): Promise<AxiosResponse<JobStatusResponse>> =>
    apiClient.get(`/import/batch/${batchId}/job/${jobId}`),

  getRecentBatches: (params?: { 
    limit?: number; 
    offset?: number;
    status?: string;
  }): Promise<AxiosResponse<{ batches: BatchInfo[]; total: number }>> =>
    apiClient.get('/import/batches/recent', { params }),

  exportBatch: (batchId: string): Promise<AxiosResponse<Blob>> =>
    apiClient.get(`/import/batch/${batchId}/export`, {
      responseType: 'blob',
    }),
};
```

### 3.4 CSV Upload Component
**File: `src/features/import/components/CsvUploadForm.tsx`**
- Drag & drop file upload
- File validation (CSV only, max size)
- Upload progress bar
- Metadata input (optional)
- Real-time progress tracking via WebSocket

### 3.5 Import Dashboard
**File: `src/features/import/pages/ImportDashboard.tsx`**
- Active imports list with live progress
- Recent batches table
- Import statistics (charts)
- Batch details view
- Error logs viewer

---

## Phase 4: System Monitoring Module (Week 5)

### 4.1 System API Endpoints
**File: `src/api/endpoints/system.ts`**
```typescript
export const systemAPI = {
  getHealth: () => apiClient.get('/system/health'),
  
  getDetailedHealth: () => apiClient.get('/system/health/detailed'),
  
  getMetrics: () => apiClient.get('/system/metrics'),
  
  getVersion: () => apiClient.get('/system/version'),
};
```

### 4.2 System Dashboard
- **Health Status Card**: Visual indicators for DB, Redis, Memory, Disk
- **Metrics Charts**: CPU, Memory, Request rates (using Prometheus data)
- **Version Info**: API version, dependencies
- **Real-time Monitoring**: Auto-refresh every 30s

---

## Phase 5: UI Components & Styling (Week 6)

### 5.1 Component Library
Create reusable components:
- **DataTable**: Sortable, filterable table
- **StatusBadge**: Color-coded status indicators
- **ProgressCard**: Import progress visualization
- **MetricCard**: System metrics display
- **ChartComponent**: Line/Bar charts for analytics
- **FileDropzone**: Drag & drop file upload
- **Toast/Notification**: Success/error messages

### 5.2 Theme Configuration
```typescript
// src/styles/theme.ts
export const theme = {
  colors: {
    primary: '#1976d2',
    secondary: '#dc004e',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
    info: '#2196f3',
  },
  spacing: (factor: number) => `${factor * 8}px`,
  breakpoints: {
    xs: '0px',
    sm: '600px',
    md: '960px',
    lg: '1280px',
    xl: '1920px',
  },
};
```

---

## Phase 6: Testing & Optimization (Week 7)

### 6.1 Unit Tests
```bash
npm install -D vitest @testing-library/react @testing-library/user-event
```
- Component tests
- Hook tests
- Store tests
- API client tests

### 6.2 E2E Tests
```bash
npm install -D @playwright/test
```
- Authentication flow
- CSV upload flow
- Navigation tests

### 6.3 Performance Optimization
- Code splitting (React.lazy)
- Image optimization
- Bundle size analysis
- Lazy loading for routes

---

## Phase 7: Production Deployment (Week 8)

### 7.1 Environment Configuration

**File: `.env.development`**
```bash
# Local development
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_WS_URL=http://localhost:3001
```

**File: `.env.production`**
```bash
# Production
VITE_API_BASE_URL=https://api.courtflow.go.ke/api/v1
VITE_WS_URL=https://api.courtflow.go.ke
```

**File: `.env.example`**
```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_WS_URL=http://localhost:3001

# Feature Flags (optional)
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=true
```

### 7.2 Build & Deploy
```bash
npm run build
npm run preview  # Test production build
```

### 7.3 CI/CD Pipeline
- GitHub Actions workflow
- Automated testing
- Build optimization
- Deployment to hosting (Vercel/Netlify)

---

## Key Features Summary

### ✅ Authentication
- Login/Register/Logout
- JWT token management with auto-refresh
- Protected routes
- Role-based access control

### ✅ CSV Import
- File upload with validation
- Real-time progress tracking (WebSocket)
- Batch management
- Error handling & retry
- Import history & statistics

### ✅ System Monitoring
- Health checks dashboard
- Prometheus metrics visualization
- Version information
- Real-time status updates

### ✅ User Experience
- Responsive design (mobile-first)
- Loading states & skeletons
- Error boundaries
- Toast notifications
- Accessibility (ARIA labels, keyboard navigation)

---

## Technology Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 19 + TypeScript |
| **Build Tool** | Vite |
| **Routing** | React Router v6 |
| **State Management** | Zustand + React Query |
| **UI Framework** | Material-UI / Shadcn UI |
| **Forms** | React Hook Form + Zod |
| **HTTP Client** | Axios |
| **WebSocket** | Socket.IO Client |
| **Charts** | Recharts / Chart.js |
| **Testing** | Vitest + Testing Library |
| **E2E Testing** | Playwright |

---

## Success Metrics

- ✅ All backend endpoints consumed
- ✅ Real-time updates working
- ✅ < 3s page load time
- ✅ 95%+ test coverage
- ✅ Responsive on all devices
- ✅ WCAG 2.1 AA accessibility compliance
- ✅ Zero console errors/warnings
