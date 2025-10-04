# User Management API Documentation

This document outlines the user management endpoints, session management, and password reset functionality.

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Request/Response Contracts](#requestresponse-contracts)
3. [Session Management](#session-management)
4. [Password Reset Flow](#password-reset-flow)
5. [Redis Keys and Data Structures](#redis-keys-and-data-structures)
6. [Environment Variables](#environment-variables)
7. [Security Considerations](#security-considerations)
8. [Operational Procedures](#operational-procedures)

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required | Rate Limited |
|--------|----------|-------------|---------------|--------------|
| GET | `/auth/me` | Get current user profile | ✅ JWT | ✅ |
| GET | `/auth/profile` | Get profile (deprecated) | ✅ JWT | ✅ |
| POST | `/auth/forgot-password` | Request password reset | ❌ | ✅ |
| POST | `/auth/reset-password` | Reset password with token | ❌ | ✅ |
| POST | `/auth/login` | User login | ❌ | ✅ |
| POST | `/auth/register` | User registration | ❌ | ✅ |
| POST | `/auth/refresh` | Refresh access token | ❌ | ✅ |
| POST | `/auth/logout` | User logout | ✅ JWT | ✅ |
| POST | `/auth/change-password` | Change password | ✅ JWT | ✅ |

## Request/Response Contracts

### GET /auth/me

**Request:**
```http
GET /auth/me
Authorization: Bearer <jwt-token>
```

**Response (200):**
```json
{
  "message": "Profile retrieved successfully",
  "data": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "DATA_ENTRY",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response (401):**
```json
{
  "message": "Authentication required"
}
```

### POST /auth/forgot-password

**Request:**
```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

**Response (400):**
```json
{
  "message": "Email is required"
}
```

### POST /auth/reset-password

**Request:**
```http
POST /auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-here",
  "newPassword": "NewSecurePass123!"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

**Response (400):**
```json
{
  "message": "Reset token and new password are required"
}
```

**Response (422):**
```json
{
  "message": "New password validation failed: Password too short, Missing uppercase letter"
}
```

### POST /auth/login (Enhanced)

**Request:**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "sessionId": "session_user-123_1640995200000",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "DATA_ENTRY"
    }
  }
}
```

## Session Management

### Session Creation

Sessions are automatically created during:
- User login (`POST /auth/login`)
- User registration (`POST /auth/register`)

### Session Structure

```typescript
interface SessionData {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastAccessed: string;
}
```

### Session Operations

- **Creation**: `sessionManager.createSession(sessionId, userId, metadata)`
- **Deletion**: `sessionManager.deleteUserSessions(userId)` - deletes all user sessions
- **Automatic Cleanup**: Sessions expire after 24 hours of inactivity

### Session Invalidation Triggers

Sessions are invalidated when:
- User explicitly logs out (`POST /auth/logout`)
- User changes password (`POST /auth/change-password`)
- User resets password (`POST /auth/reset-password`)
- Password reset token is used

## Password Reset Flow

### Step 1: Request Password Reset

1. User submits email via `POST /auth/forgot-password`
2. System generates cryptographically secure reset token
3. Token stored in Redis with 15-minute expiration
4. Audit event logged for security monitoring

### Step 2: Reset Password

1. User receives reset token (via email in production)
2. User submits token + new password via `POST /auth/reset-password`
3. System validates token and password strength
4. Password updated in database
5. All user sessions invalidated
6. All user tokens blacklisted
7. Reset token deleted from Redis
8. Audit event logged

### Security Features

- **Token Expiration**: 15 minutes
- **Single Use**: Token deleted after successful reset
- **Session Invalidation**: All sessions terminated on password change
- **Token Blacklisting**: All existing JWT tokens invalidated
- **Audit Logging**: All reset attempts logged

## Redis Keys and Data Structures

### Session Keys
```
session:{sessionId} -> SessionData
```

**Example:**
```
session:session_user-123_1640995200000 -> {
  "userId": "user-123",
  "email": "user@example.com",
  "role": "DATA_ENTRY",
  "name": "John Doe",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "createdAt": "2024-01-01T10:00:00.000Z",
  "lastAccessed": "2024-01-01T10:30:00.000Z"
}
```

### Password Reset Keys
```
password_reset:{token} -> { userId: string }
```

**Example:**
```
password_reset:a1b2c3d4e5f6... -> {
  "userId": "user-123"
}
```

### Token Blacklist Keys
```
blacklist:token:{tokenHash} -> { expiresAt: number }
```

**Example:**
```
blacklist:token:sha256_hash_of_token -> {
  "expiresAt": 1640995200000
}
```

## Environment Variables

No new environment variables were introduced for user management features. Existing variables used:

- `JWT_SECRET`: Used for token signing
- `JWT_EXPIRES_IN`: Token expiration time
- `JWT_REFRESH_EXPIRES_IN`: Refresh token expiration time
- `REDIS_URL`: Redis connection string

## Security Considerations

### Authentication Security

1. **JWT Token Security**
   - Tokens signed with strong secrets
   - Automatic expiration and refresh mechanism
   - Blacklisting on security events

2. **Session Management**
   - Server-side session storage in Redis
   - Automatic cleanup on security events
   - Session metadata tracking for audit

3. **Password Security**
   - Bcrypt hashing with appropriate rounds
   - Password strength validation
   - Secure reset token generation

### Audit Logging

All authentication events are logged with:

```typescript
interface AuditEvent {
  event: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  outcome: 'success' | 'failure' | 'attempt';
  details?: Record<string, unknown>;
  correlationId?: string;
}
```

**Logged Events:**
- `USER_LOGIN` / `USER_LOGIN_FAILED`
- `USER_LOGOUT`
- `USER_REGISTRATION`
- `PASSWORD_CHANGE`
- `PASSWORD_RESET`
- `TOKEN_REFRESH`
- `RATE_LIMIT_EXCEEDED`

## Operational Procedures

### Monitoring Session Activity

```bash
# Check active sessions in Redis
redis-cli KEYS "session:*"

# Check password reset tokens
redis-cli KEYS "password_reset:*"

# Check blacklisted tokens
redis-cli KEYS "blacklist:token:*"
```

### Manual Session Management

```bash
# Force logout all sessions for a user (admin operation)
redis-cli KEYS "session:*user-123*" | xargs redis-cli DEL

# Clean expired password reset tokens
redis-cli KEYS "password_reset:*" | xargs -I {} redis-cli TTL {}
```

### Security Incident Response

1. **Suspicious Login Activity**
   ```bash
   # Check recent login audit logs
   grep "USER_LOGIN_FAILED" logs/audit.log | tail -20
   ```

2. **Force User Logout**
   ```bash
   # Delete all user sessions
   redis-cli KEYS "session:*${USER_ID}*" | xargs redis-cli DEL
   ```

3. **Investigate Password Reset Abuse**
   ```bash
   # Check password reset audit logs
   grep "PASSWORD_RESET" logs/audit.log | tail -10
   ```

### Database Maintenance

```sql
-- Check for inactive users
SELECT id, email, last_login FROM users WHERE is_active = false;

-- Clean up old audit logs (if using database storage)
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
```

### Redis Maintenance

```bash
# Redis cleanup script (run periodically)
redis-cli --eval cleanup_sessions.lua

# cleanup_sessions.lua
local keys = redis.call('KEYS', 'session:*')
for i, key in ipairs(keys) do
  local ttl = redis.call('TTL', key)
  if ttl == -1 then
    redis.call('EXPIRE', key, 86400) -- Set 24h TTL if missing
  end
end
```

## Testing

### Unit Tests

```bash
# Run authentication service tests
npm test -- src/tests/services/authService.test.ts

# Run middleware tests
npm test -- src/tests/middleware/auth.test.ts
```

### Integration Tests

```bash
# Run authentication integration tests
npm test -- src/tests/integration/auth.integration.test.ts

# Run end-to-end tests
npm run test:e2e
```

### Test Coverage

- ✅ Service layer methods
- ✅ Controller handlers
- ✅ Middleware authentication
- ✅ Session management
- ✅ Password reset flow
- ✅ Error handling
- ✅ Security validations

## Deployment Checklist

- [ ] Redis connection configured
- [ ] JWT secrets set
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] Email service configured (for password reset)
- [ ] SSL/TLS enabled
- [ ] Session cleanup cron job scheduled
- [ ] Monitoring alerts configured

## Troubleshooting

### Common Issues

1. **Session Not Created**
   - Check Redis connectivity
   - Verify sessionManager import
   - Check Redis key prefix configuration

2. **Password Reset Token Invalid**
   - Check Redis TTL on reset keys
   - Verify token format (hex string)
   - Check for token reuse

3. **Authentication Failures**
   - Verify JWT secret consistency
   - Check token expiration
   - Validate user active status

4. **Audit Logs Missing**
   - Check log file permissions
   - Verify audit logger configuration
   - Check disk space for log files

### Debug Commands

```bash
# Check Redis connectivity
redis-cli PING

# View recent audit events
tail -f logs/audit.log

# Check active sessions
redis-cli KEYS "session:*" | wc -l

# Validate JWT token
node -e "const jwt = require('jsonwebtoken'); console.log(jwt.verify('token', 'secret'))"