# CourtFlow Backend Service

## Overview

The CourtFlow Backend Service is a Node.js/Express API service that provides data access and business logic for the CourtFlow court performance dashboard. It features robust database connections, Redis caching, comprehensive health monitoring, and background job processing.

## Architecture

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis with multiple client instances
- **Background Jobs**: BullMQ with Redis
- **Monitoring**: Prometheus metrics and comprehensive health checks
- **Testing**: Vitest with comprehensive test coverage

## Database Configuration

### Prisma Setup

The backend uses Prisma ORM for database operations with the following features:

- **Connection Pooling**: Configured for optimal performance
- **Health Checks**: Comprehensive database connectivity monitoring
- **Transaction Support**: Retry logic and proper error handling
- **Migration Management**: Automated migration scripts

### Database Models

Key database models include:
- `Court`: Court information and hierarchy
- `Judge`: Judge details and assignments
- `Case`: Case records with full lifecycle tracking
- `CaseActivity`: Detailed case activity logs
- `User`: User management and roles
- `DailyImportBatch`: Data import tracking

### Connection Features

- **Automatic Reconnection**: Built-in retry logic for connection failures
- **Health Monitoring**: Real-time connection status tracking
- **Connection Pooling**: Optimized for concurrent requests
- **Transaction Wrapper**: Retry logic for failed transactions

## Redis Configuration

### Multiple Redis Clients

The backend uses three specialized Redis clients:

1. **Main Redis Client**: General purpose operations
2. **Session Redis Client**: User session management
3. **Cache Redis Client**: Application data caching

### Cache Manager

Comprehensive caching utilities:
- **Basic Operations**: Get, set, delete, exists
- **Batch Operations**: Multiple get/set operations
- **Pattern Invalidation**: Bulk cache invalidation
- **TTL Management**: Flexible expiration handling
- **Increment Operations**: Atomic counter operations

### Session Manager

Robust session management:
- **Session Creation**: User session initialization
- **Session Retrieval**: Automatic last-accessed updates
- **Session Updates**: Partial session data updates
- **Session Cleanup**: User-specific session deletion
- **Session Extension**: TTL management

## Health Monitoring

### Comprehensive Health Checks

The health check system monitors:
- **Database Connectivity**: Connection and query execution
- **Redis Connectivity**: All Redis client instances
- **Memory Usage**: System memory monitoring
- **Disk Usage**: Storage availability
- **Response Times**: Performance metrics

### Health Check Endpoints

- `GET /api/system/health` - Quick health check
- `GET /api/system/health/detailed` - Comprehensive health report
- `GET /api/system/metrics` - Prometheus metrics
- `GET /api/system/version` - Version information

## Scripts and Utilities

### Migration Scripts

```bash
# Development migration
npm run migrate:dev

# Staging migration
npm run migrate:staging

# Production migration (with backup)
npm run migrate:prod

# Dry run migrations
npm run migrate:dev:dry
npm run migrate:staging:dry
npm run migrate:prod:dry
```

### Database Seeding

```bash
# Seed development data
npm run db:seed:dev

# Seed staging data (with force)
npm run db:seed:staging

# Seed production data
npm run db:seed:prod
```

### Development Commands

```bash
# Start development server
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Database operations
npm run db:generate
npm run db:migrate
npm run db:studio

# Code quality
npm run lint
npm run typecheck
```

## Environment Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/courtflow_db"
DIRECT_DATABASE_URL="postgresql://username:password@localhost:5432/courtflow_db"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-at-least-32-characters-long"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# Application
NODE_ENV="development"
PORT=3001
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:9002"
```

## Connection Pooling

### Database Connection Pool

- **Connection Limit**: 10 concurrent connections
- **Pool Timeout**: 10 seconds
- **Query Timeout**: 30 seconds
- **Retry Logic**: Exponential backoff with 5 max retries

### Redis Connection Pool

- **Keep Alive**: 30 seconds
- **Connect Timeout**: 10 seconds
- **Command Timeout**: 5 seconds
- **Retry Logic**: 3 max retries with failover support

## Error Handling

### Database Errors

- **Connection Failures**: Automatic retry with exponential backoff
- **Query Timeouts**: Configurable timeout with proper error responses
- **Transaction Failures**: Automatic rollback and retry logic
- **Constraint Violations**: Proper error mapping and user feedback

### Redis Errors

- **Connection Failures**: Graceful degradation with fallback behavior
- **Command Timeouts**: Proper error handling and logging
- **Memory Issues**: Monitoring and alerting for Redis memory usage
- **Cluster Failures**: Automatic failover and reconnection

## Testing

### Test Coverage

- **Database Tests**: Connection, transactions, schema validation
- **Redis Tests**: All client types, cache operations, session management
- **Health Check Tests**: Comprehensive monitoring validation
- **Integration Tests**: End-to-end API testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui

# Watch mode
npm run test:watch
```

## Monitoring and Observability

### Metrics Collection

- **Prometheus Metrics**: Application and system metrics
- **Health Metrics**: Service availability and performance
- **Database Metrics**: Connection pool and query performance
- **Redis Metrics**: Cache hit rates and connection status

### Logging

- **Structured Logging**: JSON format with Winston
- **Log Levels**: Configurable logging levels
- **Error Tracking**: Comprehensive error logging and tracking
- **Performance Logging**: Request/response timing and metrics

## Security Considerations

### Database Security

- **Connection Encryption**: SSL/TLS for database connections
- **Parameter Binding**: Protection against SQL injection
- **Access Control**: Role-based database access
- **Audit Logging**: Database operation tracking

### Redis Security

- **Authentication**: Redis AUTH support
- **Encryption**: TLS encryption for Redis connections
- **Access Control**: Redis ACL support
- **Data Isolation**: Separate key prefixes for different data types

## Performance Optimization

### Database Optimization

- **Query Optimization**: Efficient query patterns and indexing
- **Connection Pooling**: Optimal connection management
- **Caching Strategy**: Redis caching for frequently accessed data
- **Batch Operations**: Efficient bulk data operations

### Redis Optimization

- **Memory Management**: Efficient data structures and TTL management
- **Pipeline Operations**: Batch Redis commands for better performance
- **Cluster Support**: Horizontal scaling with Redis Cluster
- **Monitoring**: Real-time performance monitoring

## Deployment

### Production Considerations

- **Environment Variables**: Secure configuration management
- **Health Checks**: Load balancer health check endpoints
- **Graceful Shutdown**: Proper connection cleanup on termination
- **Monitoring**: Comprehensive application monitoring

### Docker Support

The backend includes Docker configuration for containerized deployment with proper health checks and environment variable management.

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Check DATABASE_URL configuration
   - Verify database server availability
   - Review connection pool settings

2. **Redis Connection Issues**
   - Verify REDIS_URL configuration
   - Check Redis server status
   - Review Redis client configuration

3. **Performance Issues**
   - Monitor database query performance
   - Check Redis memory usage
   - Review application metrics

### Debug Commands

```bash
# Check database connection
npm run db:studio

# View application logs
npm run dev

# Run health checks
curl http://localhost:3001/api/system/health/detailed
```

## Contributing

When contributing to the backend service:

1. Follow TypeScript best practices
2. Add comprehensive tests for new features
3. Update documentation for configuration changes
4. Ensure proper error handling and logging
5. Test database migrations thoroughly
6. Validate Redis operations and caching logic