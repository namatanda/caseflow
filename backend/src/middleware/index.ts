// Authentication and Authorization
export {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireUserOrAdmin,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  type JwtPayload
} from './auth';

// CORS Configuration
export {
  corsMiddleware,
  devCorsMiddleware,
  getCorsMiddleware,
  corsOptions,
  devCorsOptions
} from './cors';

// Error Handling
export {
  errorHandler,
  ApiError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError
} from './errorHandler';

// Rate Limiting
export {
  generalRateLimit,
  authRateLimit,
  uploadRateLimit,
  creationRateLimit,
  searchRateLimit,
  createCustomRateLimit,
  getRateLimit
} from './rateLimit';

// Request Logging
export { requestLogger } from './requestLogger';

// 404 Handler
export { notFoundHandler } from './notFoundHandler';

// Security Middleware
export {
  securityHeaders,
  sanitizeRequest,
  ipWhitelist,
  requestSizeLimit,
  applySecurity
} from './security';