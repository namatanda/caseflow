# Middleware Documentation

This directory contains all middleware components for the CourtFlow Backend API, implementing comprehensive security, authentication, and request handling.

## Overview

The middleware system provides:
- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Security**: Request sanitization, security headers, and input validation
- **Rate Limiting**: Configurable rate limiting for different endpoint types
- **CORS**: Cross-origin resource sharing with environment-aware configuration
- **Error Handling**: Comprehensive error handling with structured logging
- **Request Logging**: Correlation ID tracking and structured request/response logging

## Middleware Components

### 1. Authentication (`auth.ts`)

Provides JWT-based authentication and authorization middleware.

#### Key Functions:
- `authenticateToken`: Validates JWT tokens and adds user info to request
- `optionalAuth`: Optional authentication that doesn't throw errors
- `requireRole(roles)`: Role-based authorization middleware
- `requireAdmin`: Admin-only access middleware
- `generateToken(payload)`: Generate access tokens
- `generateRefreshToken(payload)`: Generate refresh tokens

#### Usage:
```typescript
import { authenticateToken, requireAdmin } from '@/middleware';

// Protect route with authentication
router.get('/protected', authenticateToken, handler);

// Require admin role
router.delete('/admin-only', authenticateToken, requireAdmin, handler);

// Multiple roles
router.put('/user-or-admin', authenticateToken, requireRole(['user', 'admin']), handler);
```

### 2. CORS Configuration (`cors.ts`)

Environment-aware CORS configuration with security best practices.

#### Features:
- Production: Strict origin validation
- Development: Permissive configuration for development
- Configurable allowed origins, methods, and headers
- Credential support for authentication

#### Usage:
```typescript
import { getCorsMiddleware } from '@/middleware';

app.use(getCorsMiddleware()); // Automatically selects based on environment
```

### 3. Rate Limiting (`rateLimit.ts`)

Configurable rate limiting for different endpoint types.

#### Available Rate Limiters:
- `generalRateLimit`: 100 requests/15min (general API)
- `authRateLimit`: 5 requests/15min (authentication endpoints)
- `uploadRateLimit`: 10 requests/hour (file uploads)
- `creationRateLimit`: 30 requests/10min (create/modify operations)
- `searchRateLimit`: 200 requests/15min (search/query operations)

#### Usage:
```typescript
import { getRateLimit, authRateLimit } from '@/middleware';

// Apply specific rate limiter
router.post('/auth/login', authRateLimit, loginHandler);

// Use factory function
router.get('/search', getRateLimit('search'), searchHandler);
```

### 4. Security (`security.ts`)

Comprehensive security middleware including headers, sanitization, and validation.

#### Features:
- **Security Headers**: Helmet configuration with CSP, HSTS, etc.
- **Request Sanitization**: XSS protection and input cleaning
- **IP Whitelisting**: Restrict access by IP address
- **Request Size Limiting**: Prevent oversized requests

#### Usage:
```typescript
import { applySecurity, ipWhitelist, requestSizeLimit } from '@/middleware';

// Apply all security measures
app.use(applySecurity);

// IP whitelist for admin endpoints
router.use('/admin', ipWhitelist(['192.168.1.1', '10.0.0.1']));

// Custom size limit
router.post('/upload', requestSizeLimit(50 * 1024 * 1024), uploadHandler); // 50MB
```

### 5. Error Handling (`errorHandler.ts`)

Centralized error handling with structured logging and consistent responses.

#### Error Types:
- `ApiError`: Base error class with correlation ID
- `ValidationError`: Input validation errors (400)
- `AuthenticationError`: Authentication failures (401)
- `AuthorizationError`: Authorization failures (403)
- `NotFoundError`: Resource not found (404)
- `ConflictError`: Resource conflicts (409)
- `RateLimitError`: Rate limit exceeded (429)

#### Usage:
```typescript
import { ValidationError, NotFoundError } from '@/middleware';

// Throw structured errors
if (!user) {
  throw new NotFoundError('User not found');
}

if (validationResult.error) {
  throw new ValidationError('Invalid input data');
}
```

### 6. Request Logging (`requestLogger.ts`)

Structured request/response logging with correlation IDs.

#### Features:
- Correlation ID generation for request tracking
- Request/response timing
- Structured logging with metadata
- Response header injection

#### Usage:
```typescript
import { requestLogger } from '@/middleware';

app.use(requestLogger); // Apply globally
```

## Middleware Stack Order

The middleware should be applied in the following order for optimal security and functionality:

```typescript
import express from 'express';
import { 
  requestLogger,
  applySecurity,
  getCorsMiddleware,
  generalRateLimit,
  errorHandler,
  notFoundHandler
} from '@/middleware';

const app = express();

// 1. Trust proxy (for rate limiting and IP detection)
app.set('trust proxy', 1);

// 2. Request logging (first to capture all requests)
app.use(requestLogger);

// 3. Security middleware (headers, sanitization)
app.use(applySecurity);

// 4. CORS configuration
app.use(getCorsMiddleware());

// 5. Rate limiting
app.use(generalRateLimit);

// 6. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 7. API routes
app.use('/api/v1', apiRoutes);

// 8. 404 handler (after all routes)
app.use(notFoundHandler);

// 9. Error handler (must be last)
app.use(errorHandler);
```

## Environment Configuration

Middleware behavior is controlled through environment variables:

```env
# JWT Configuration
JWT_SECRET=your-secret-key-minimum-32-characters
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:9002

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

## Testing

Each middleware component includes comprehensive unit tests:

```bash
# Run middleware tests
npm test middleware

# Run specific middleware tests
npm test auth.test.ts
npm test rateLimit.test.ts
npm test security.test.ts
```

## Security Considerations

1. **JWT Secrets**: Use strong, randomly generated secrets (minimum 32 characters)
2. **CORS Origins**: Always specify exact origins in production
3. **Rate Limiting**: Adjust limits based on your application's needs
4. **Request Sanitization**: Enabled by default to prevent XSS attacks
5. **Security Headers**: Comprehensive security headers applied automatically
6. **Error Information**: Sensitive information is not exposed in production errors

## Performance Impact

- **Authentication**: ~1-2ms per request for JWT verification
- **Rate Limiting**: ~0.5ms per request (Redis-based)
- **Security Sanitization**: ~0.1-0.5ms per request depending on payload size
- **CORS**: Minimal impact (~0.1ms)
- **Logging**: ~0.2-0.5ms per request

## Monitoring and Observability

All middleware components integrate with the structured logging system:

- **Correlation IDs**: Track requests across the entire stack
- **Performance Metrics**: Request timing and throughput
- **Error Tracking**: Structured error logging with context
- **Security Events**: Authentication failures, rate limit violations, etc.

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Check `ALLOWED_ORIGINS` environment variable
2. **Rate Limit Exceeded**: Adjust rate limits or implement user-specific limits
3. **Authentication Failures**: Verify JWT secret and token format
4. **Request Size Errors**: Adjust body parser limits and request size limits

### Debug Mode:

Set `LOG_LEVEL=debug` to enable detailed middleware logging for troubleshooting.