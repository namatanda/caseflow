# React UI Development Plan for CourtFlow Backend

## Overview
Systematic plan for developing a React UI to consume all backend endpoints with proper architecture, state management, and user experience.

---

## Phase 1: Project Setup & Architecture (Week 1)

### 1.1 Core Dependencies Installation
```bash
# State Management & Data Fetching
npm install @tanstack/react-query axios zustand

# Routing
npm install react-router-dom

# UI Framework & Components
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
# OR
npm install @shadcn/ui tailwindcss @tailwindcss/forms

# Form Management
npm install react-hook-form zod @hookform/resolvers

# Real-time Communication
npm install socket.io-client

# Utilities
npm install date-fns clsx

# Development
npm install -D @types/socket.io-client
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
import axios, { AxiosError, AxiosResponse } from 'axios';
import { useAuthStore } from '@/store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle errors & token refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Token expired - attempt refresh
    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
        
        if (originalRequest?.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

---

## Phase 2: Authentication Module (Week 2)

### 2.1 Auth Store (Zustand)
**File: `src/store/authStore.ts`**
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      setUser: (user) => set({ user }),
      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);
```

### 2.2 Auth API Endpoints
**File: `src/api/endpoints/auth.ts`**
```typescript
import { apiClient } from '../client';

export const authAPI = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  register: (data: { email: string; password: string; name: string }) =>
    apiClient.post('/auth/register', data),

  logout: () => apiClient.post('/auth/logout'),

  getProfile: () => apiClient.get('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),

  refreshToken: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),
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
interface ImportProgress {
  batchId: string;
  jobId: string;
  progress: number;
  stage: 'validation' | 'parsing' | 'importing' | 'completed' | 'failed';
  processedRecords?: number;
  totalRecords?: number;
  message?: string;
}

interface ImportState {
  activeImports: Map<string, ImportProgress>;
  recentBatches: any[];
  updateProgress: (batchId: string, progress: ImportProgress) => void;
  removeImport: (batchId: string) => void;
  setRecentBatches: (batches: any[]) => void;
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
    const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';
    
    socketRef.current = io(WS_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    // Listen for import progress
    socketRef.current.on('import:progress', (data) => {
      updateProgress(data.batchId, data);
    });

    // Listen for completion
    socketRef.current.on('import:completed', (data) => {
      updateProgress(data.batchId, { ...data, stage: 'completed' });
      setTimeout(() => removeImport(data.batchId), 5000);
    });

    // Listen for failures
    socketRef.current.on('import:failed', (data) => {
      updateProgress(data.batchId, { ...data, stage: 'failed' });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

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

export const importAPI = {
  uploadCsv: (file: File, metadata?: any) => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    return apiClient.post('/import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getBatchStatus: (batchId: string) =>
    apiClient.get(`/import/batch/${batchId}`),

  getJobStatus: (jobId: string) =>
    apiClient.get(`/import/job/${jobId}`),

  getRecentBatches: (params?: { limit?: number; offset?: number }) =>
    apiClient.get('/import/batches/recent', { params }),

  getImportStats: (params?: { startDate?: string; endDate?: string }) =>
    apiClient.get('/import/stats', { params }),
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
```bash
# .env.production
VITE_API_BASE_URL=https://api.courtflow.go.ke/api/v1
VITE_WS_URL=https://api.courtflow.go.ke
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
