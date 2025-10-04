# CourtFlow Backend API Documentation

## Overview

CourtFlow Backend API is a RESTful service for managing court case data, including CSV import capabilities, case management, and system monitoring.

**Base URL:** `http://localhost:3000/api/v1`  
**API Documentation:** `http://localhost:3000/api-docs`  
**Version:** 1.0.0

## Authentication

All API endpoints (except health checks) require JWT authentication.

### Headers
```
Authorization: Bearer <your-jwt-token>
```

### Token Refresh
Tokens expire after 15 minutes. Use the refresh token endpoint to obtain a new access token.

## Rate Limiting

- **General API:** 100 requests per 15 minutes per IP
- **File Upload:** 10 requests per 15 minutes per IP
- **Search/Export:** 30 requests per 15 minutes per IP

## API Endpoints

### 1. Import System

#### CSV Upload
- **POST** `/api/v1/import/csv`
- Upload and process CSV files with case data
- **Authentication:** Required (DATA_ENTRY or ADMIN role)
- **Rate Limit:** 10 req/15min
- **Max File Size:** 50MB
- **Supported Format:** CSV with UTF-8 encoding

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/import/csv \
  -H "Authorization: Bearer <token>" \
  -F "csvFile=@cases.csv" \
  -F 'metadata={"filename":"cases.csv"}' \
  -F 'options={"chunkSize":500}'
```

**Response (202):**
```json
{
  "batchId": "batch_1234567890",
  "jobId": "job_9876543210",
  "status": "queued",
  "message": "CSV import queued successfully",
  "checksum": "abc123def456..."
}
```

#### Get Batch Status
- **GET** `/api/v1/import/batches/{batchId}`
- Retrieve import batch progress and results
- **Authentication:** Required (VIEWER, DATA_ENTRY, or ADMIN)

**Response (200):**
```json
{
  "id": "batch_1234567890",
  "status": "COMPLETED",
  "totalRecords": 1000,
  "successfulRecords": 950,
  "failedRecords": 50,
  "filename": "cases.csv",
  "importDate": "2024-01-01T00:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:05:00Z"
}
```

#### Get Job Status
- **GET** `/api/v1/import/jobs/{jobId}`
- Monitor real-time job processing status
- **Authentication:** Required

**Response (200):**
```json
{
  "jobId": "job_9876543210",
  "state": "active",
  "progress": 75,
  "attemptsMade": 1,
  "processedRecords": 750,
  "totalRecords": 1000
}
```

#### List Recent Batches
- **GET** `/api/v1/import/batches/recent?limit=10`
- Get recent import batches
- **Authentication:** Required

#### Export Cases
- **GET** `/api/v1/import/cases/export`
- Export filtered cases to CSV
- **Authentication:** Required
- **Rate Limit:** 30 req/15min

**Query Parameters:**
- `courtName` - Filter by court name
- `caseTypeId` - Filter by case type
- `status` - Filter by case status (ACTIVE, RESOLVED, PENDING, TRANSFERRED, DELETED)
- `pageSize` - Records per page (max 1000)

### 2. System & Monitoring

#### Health Check (Quick)
- **GET** `/api/v1/system/health`
- Basic health status
- **Authentication:** Not required

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0"
}
```

#### Health Check (Detailed)
- **GET** `/api/v1/system/health/detailed`
- Comprehensive system diagnostics
- **Authentication:** Not required

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 15
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2
    },
    "memory": {
      "status": "healthy",
      "usage": {
        "used": 524288000,
        "total": 2147483648,
        "percentage": 24.4
      }
    },
    "disk": {
      "status": "healthy",
      "usage": {
        "used": 10737418240,
        "total": 107374182400,
        "percentage": 10
      }
    }
  }
}
```

#### Prometheus Metrics
- **GET** `/api/v1/system/metrics`
- Export Prometheus metrics
- **Authentication:** Not required
- **Format:** text/plain or JSON

#### Version Information
- **GET** `/api/v1/system/version`
- Get API version and build info
- **Authentication:** Not required

**Response (200):**
```json
{
  "name": "CourtFlow Backend API",
  "version": "1.0.0",
  "apiVersion": "v1",
  "nodeVersion": "v18.17.0",
  "environment": "production",
  "uptime": 3600,
  "buildDate": "2024-01-01T00:00:00Z",
  "platform": "linux",
  "arch": "x64"
}
```

### 3. Authentication

#### Login
- **POST** `/api/v1/auth/login`
- Authenticate user and receive tokens

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "DATA_ENTRY"
  }
}
```

#### Refresh Token
- **POST** `/api/v1/auth/refresh`
- Get new access token using refresh token

#### Logout
- **POST** `/api/v1/auth/logout`
- Invalidate current session

## WebSocket Real-Time Updates

**Endpoint:** `ws://localhost:3000/ws`

### Events

#### Import Progress
```json
{
  "event": "import:progress",
  "data": {
    "batchId": "batch_123",
    "jobId": "job_456",
    "progress": 50,
    "stage": "importing",
    "processedRecords": 500,
    "totalRecords": 1000
  }
}
```

#### Import Completed
```json
{
  "event": "import:completed",
  "data": {
    "batchId": "batch_123",
    "jobId": "job_456",
    "totalRecords": 1000,
    "successfulRecords": 950,
    "failedRecords": 50,
    "duration": 45000
  }
}
```

#### Import Failed
```json
{
  "event": "import:failed",
  "data": {
    "batchId": "batch_123",
    "jobId": "job_456",
    "error": "Validation failed at row 250",
    "timestamp": "2024-01-01T00:00:00Z",
    "stage": "validation"
  }
}
```

### Subscribe to Batch Updates

```javascript
const socket = io('http://localhost:3000');

// Join batch room
socket.emit('subscribe:batch', { batchId: 'batch_123' });

// Listen for progress
socket.on('import:progress', (data) => {
  console.log(`Progress: ${data.progress}%`);
});

// Listen for completion
socket.on('import:completed', (data) => {
  console.log('Import completed:', data);
});

// Listen for failures
socket.on('import:failed', (data) => {
  console.error('Import failed:', data);
});
```

## Error Handling

### Standard Error Response
```json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "details": {}
}
```

### Common Error Codes

- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `413` - Payload Too Large
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error
- `503` - Service Unavailable

## Data Validation

### CSV Import Validation

Required CSV columns:
- `case_number` - Unique case identifier
- `court_name` - Name of the court
- `case_type` - Type of case
- `filing_date` - Date case was filed (ISO 8601 format)
- `parties` - Parties involved (JSON array or semicolon-separated)
- `status` - Case status (ACTIVE, RESOLVED, PENDING, TRANSFERRED, DELETED)

Optional columns:
- `judge_name`
- `next_hearing_date`
- `case_summary`
- `documents` (JSON array)

### File Integrity

All uploaded files are validated with SHA-256 checksums:
- Checksum is calculated during upload
- Stored with batch metadata
- Used for verification and deduplication

## Performance Optimization

### Caching Strategy
- Redis caching for frequently accessed data
- Cache TTL: 5 minutes for dynamic data, 1 hour for static data

### Pagination
- Default page size: 20
- Maximum page size: 100
- Use `page` and `limit` query parameters

### Batch Processing
- CSV imports processed in chunks of 500 records
- Background processing via BullMQ
- Automatic retry on failures (max 3 attempts)

## Security

### Rate Limiting
Implemented at multiple levels:
- IP-based general limit: 100 req/15min
- Upload-specific: 10 req/15min
- Search/export: 30 req/15min

### CORS Configuration
Allowed origins configured per environment:
- Development: `http://localhost:5173`, `http://localhost:3000`
- Production: Configured domain only

### Input Sanitization
- All user input sanitized against XSS
- SQL injection prevented via Prisma ORM
- File upload validation (type, size, content)

## Development

### Running Locally
```bash
# Install dependencies
pnpm install

# Run migrations
pnpm prisma migrate dev

# Start development server
pnpm dev

# Run tests
pnpm test

# Generate API client
pnpm generate:client
```

### Environment Variables
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
```

## Support

For issues or questions:
- **Documentation:** http://localhost:3000/api-docs
- **GitHub Issues:** [CourtFlow Issues](https://github.com/courtflow/backend/issues)
- **Email:** dev@courtflow.go.ke
