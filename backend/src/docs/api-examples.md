# API Examples

## CSV Import Examples

### Example 1: Basic CSV Upload

**Request:**
```bash
curl -X POST 'http://localhost:3000/api/v1/import/csv' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -F 'csvFile=@sample-cases.csv' \
  -F 'metadata={"filename":"sample-cases.csv","uploadedBy":"admin@courtflow.go.ke"}' \
  -F 'options={"chunkSize":500,"validateOnly":false}'
```

**Response:**
```json
{
  "batchId": "batch_1704067200000",
  "jobId": "job_1704067200001",
  "status": "queued",
  "message": "CSV import queued successfully",
  "checksum": "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
  "metadata": {
    "filename": "sample-cases.csv",
    "fileSize": 524288,
    "uploadedBy": "admin@courtflow.go.ke",
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Example 2: Check Batch Status

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/import/batches/batch_1704067200000?includeErrors=true' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response (In Progress):**
```json
{
  "id": "batch_1704067200000",
  "importDate": "2024-01-01T00:00:00.000Z",
  "filename": "sample-cases.csv",
  "status": "PROCESSING",
  "totalRecords": 1000,
  "successfulRecords": 750,
  "failedRecords": 25,
  "processingProgress": 77.5,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:03:30.000Z",
  "metadata": {
    "fileSize": 524288,
    "checksum": "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a"
  },
  "errors": [
    {
      "row": 45,
      "field": "case_number",
      "message": "Duplicate case number: C2023-001234",
      "value": "C2023-001234"
    },
    {
      "row": 102,
      "field": "filing_date",
      "message": "Invalid date format",
      "value": "32/13/2023"
    }
  ]
}
```

**Response (Completed):**
```json
{
  "id": "batch_1704067200000",
  "importDate": "2024-01-01T00:00:00.000Z",
  "filename": "sample-cases.csv",
  "status": "COMPLETED",
  "totalRecords": 1000,
  "successfulRecords": 975,
  "failedRecords": 25,
  "processingProgress": 100,
  "duration": 180000,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:03:00.000Z",
  "completedAt": "2024-01-01T00:03:00.000Z"
}
```

### Example 3: Monitor Job Progress

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/import/jobs/job_1704067200001' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**
```json
{
  "jobId": "job_1704067200001",
  "batchId": "batch_1704067200000",
  "state": "active",
  "progress": 85,
  "attemptsMade": 1,
  "processedRecords": 850,
  "totalRecords": 1000,
  "timestamp": "2024-01-01T00:02:30.000Z",
  "data": {
    "filePath": "/uploads/sample-cases.csv",
    "batchId": "batch_1704067200000"
  }
}
```

### Example 4: List Recent Batches

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/import/batches/recent?limit=5' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Response:**
```json
{
  "batches": [
    {
      "id": "batch_1704067200000",
      "filename": "sample-cases.csv",
      "status": "COMPLETED",
      "totalRecords": 1000,
      "successfulRecords": 975,
      "failedRecords": 25,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "batch_1704063600000",
      "filename": "january-cases.csv",
      "status": "FAILED",
      "totalRecords": 0,
      "successfulRecords": 0,
      "failedRecords": 0,
      "createdAt": "2023-12-31T23:00:00.000Z",
      "errorMessage": "Invalid CSV format"
    },
    {
      "id": "batch_1704060000000",
      "filename": "december-cases.csv",
      "status": "COMPLETED",
      "totalRecords": 500,
      "successfulRecords": 500,
      "failedRecords": 0,
      "createdAt": "2023-12-31T22:00:00.000Z"
    }
  ],
  "total": 3,
  "limit": 5
}
```

### Example 5: Export Cases to CSV

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/import/cases/export?courtName=Nairobi&status=ACTIVE&pageSize=100' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Accept: text/csv' \
  --output exported-cases.csv
```

**Response (CSV file):**
```csv
case_number,court_name,case_type,filing_date,status,parties,judge_name
C2024-001,Nairobi High Court,Civil,2024-01-15,ACTIVE,"[""John Doe"",""Jane Smith""]",Hon. Justice Kamau
C2024-002,Nairobi Magistrate,Criminal,2024-01-16,ACTIVE,"[""State"",""Michael Johnson""]",Hon. Magistrate Wanjiru
...
```

## System & Health Examples

### Example 6: Quick Health Check

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/system/health'
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 86400,
  "environment": "production",
  "version": "1.0.0",
  "responseTime": 5
}
```

### Example 7: Detailed Health Check

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/system/health/detailed'
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 86400,
  "environment": "production",
  "version": "1.0.0",
  "responseTime": 45,
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 15,
      "message": "Database connection successful",
      "details": {
        "connected": true,
        "poolSize": 10,
        "activeConnections": 2
      }
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2,
      "message": "Redis connection successful",
      "details": {
        "connected": true,
        "usedMemory": "2.5M",
        "uptime": 172800
      }
    },
    "memory": {
      "status": "healthy",
      "usage": {
        "used": 536870912,
        "total": 2147483648,
        "percentage": 25,
        "rss": 524288000,
        "heapUsed": 419430400,
        "heapTotal": 524288000
      },
      "message": "Memory usage normal"
    },
    "disk": {
      "status": "healthy",
      "usage": {
        "used": 10737418240,
        "total": 107374182400,
        "percentage": 10,
        "available": 96636764160
      },
      "message": "Disk space sufficient"
    }
  }
}
```

### Example 8: Prometheus Metrics

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/system/metrics' \
  -H 'Accept: text/plain'
```

**Response (text/plain):**
```prometheus
# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 45.234

# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds.
# TYPE process_cpu_system_seconds_total counter
process_cpu_system_seconds_total 12.456

# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 524288000

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005",method="GET",route="/api/v1/system/health"} 1234
http_request_duration_seconds_bucket{le="0.01",method="GET",route="/api/v1/system/health"} 2345
http_request_duration_seconds_bucket{le="0.025",method="GET",route="/api/v1/system/health"} 3456
...
```

### Example 9: Version Information

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/system/version'
```

**Response:**
```json
{
  "name": "CourtFlow Backend API",
  "version": "1.0.0",
  "apiVersion": "v1",
  "nodeVersion": "v18.17.0",
  "environment": "production",
  "uptime": 86400,
  "buildDate": "2024-01-01T00:00:00.000Z",
  "platform": "linux",
  "arch": "x64"
}
```

## Authentication Examples

### Example 10: User Login

**Request:**
```bash
curl -X POST 'http://localhost:3000/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@courtflow.go.ke",
    "password": "SecurePassword123!"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsImVtYWlsIjoiYWRtaW5AY291cnRmbG93LmdvLmtlIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE3MDQwNjgxMDB9.signature",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjE3MDQ2NzIwMDB9.signature",
  "user": {
    "id": "user_123",
    "email": "admin@courtflow.go.ke",
    "name": "System Administrator",
    "role": "ADMIN",
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}
```

### Example 11: Refresh Access Token

**Request:**
```bash
curl -X POST 'http://localhost:3000/api/v1/auth/refresh' \
  -H 'Content-Type: application/json' \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new_token_payload.signature",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new_refresh_payload.signature"
}
```

## WebSocket Examples

### Example 12: Real-Time Import Progress

**JavaScript Client:**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to specific batch updates
const batchId = 'batch_1704067200000';
socket.emit('subscribe:batch', { batchId });

// Listen for progress updates
socket.on('import:progress', (data) => {
  console.log(`Import Progress: ${data.progress}%`);
  console.log(`Stage: ${data.stage}`);
  console.log(`Processed: ${data.processedRecords}/${data.totalRecords}`);
});

// Listen for completion
socket.on('import:completed', (data) => {
  console.log('Import Completed!');
  console.log(`Successful: ${data.successfulRecords}`);
  console.log(`Failed: ${data.failedRecords}`);
  console.log(`Duration: ${data.duration}ms`);
});

// Listen for errors
socket.on('import:failed', (data) => {
  console.error('Import Failed:', data.error);
  console.error('Stage:', data.stage);
});

// Cleanup
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

**Progress Event Data:**
```json
{
  "batchId": "batch_1704067200000",
  "jobId": "job_1704067200001",
  "progress": 50,
  "stage": "importing",
  "processedRecords": 500,
  "totalRecords": 1000,
  "errors": 5,
  "warnings": 12,
  "estimatedTimeRemaining": 60000
}
```

## Error Examples

### Example 13: Validation Error

**Request:**
```bash
curl -X POST 'http://localhost:3000/api/v1/import/csv' \
  -H 'Authorization: Bearer token...' \
  -F 'csvFile=@invalid.txt'
```

**Response (400):**
```json
{
  "statusCode": 400,
  "message": "Invalid file type. Only CSV files are allowed",
  "code": "INVALID_FILE_TYPE",
  "details": {
    "receivedType": "text/plain",
    "expectedType": "text/csv",
    "filename": "invalid.txt"
  }
}
```

### Example 14: Authentication Error

**Request:**
```bash
curl -X GET 'http://localhost:3000/api/v1/import/batches/recent' \
  -H 'Authorization: Bearer invalid_token'
```

**Response (401):**
```json
{
  "statusCode": 401,
  "message": "Invalid or expired token",
  "code": "INVALID_TOKEN"
}
```

### Example 15: Rate Limit Error

**Response (429):**
```json
{
  "statusCode": 429,
  "message": "Too many requests, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 10,
    "window": "15 minutes",
    "retryAfter": 900
  }
}
```

### Example 16: Not Found Error

**Response (404):**
```json
{
  "statusCode": 404,
  "message": "Batch not found",
  "code": "BATCH_NOT_FOUND",
  "details": {
    "batchId": "batch_nonexistent"
  }
}
```
