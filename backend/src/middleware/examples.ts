/* eslint-disable @typescript-eslint/no-misused-promises */
/**
 * Middleware Usage Examples
 * 
 * This file demonstrates how to use the various middleware components
 * in different scenarios. These examples can be used as reference
 * when implementing API routes.
 */

import { Router, type Router as RouterType } from 'express';
import {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireAdmin,
  getRateLimit,
  authRateLimit,
  uploadRateLimit,
  ipWhitelist,
  requestSizeLimit
} from './index';

const router: RouterType = Router();

// Example 1: Public endpoint with optional authentication
router.get('/public-data', optionalAuth, (_req, res) => {
  // User info available in req.user if authenticated, undefined otherwise
  const isAuthenticated = !!_req.user;
  
  res.json({
    message: 'Public data accessible to all',
    authenticated: isAuthenticated,
    userId: _req.user?.id
  });
});

// Example 2: Protected endpoint requiring authentication
router.get('/protected-data', authenticateToken, (_req, res) => {
  // req.user is guaranteed to exist here
  res.json({
    message: 'Protected data',
    user: _req.user
  });
});

// Example 3: Admin-only endpoint
router.delete('/admin/users/:id', 
  authenticateToken, 
  requireAdmin, 
  (_req, res) => {
    res.json({ message: 'User deleted by admin' });
  }
);

// Example 4: Role-based access (multiple roles allowed)
router.put('/content/:id', 
  authenticateToken, 
  requireRole(['editor', 'admin']), 
  (_req, res) => {
    res.json({ message: 'Content updated' });
  }
);

// Example 5: Authentication endpoints with strict rate limiting
router.post('/auth/login', 
  authRateLimit, // 5 requests per 15 minutes
  (_req, res) => {
    // Login logic here
    res.json({ message: 'Login attempt' });
  }
);

// Example 6: File upload with specific rate limiting and size limits
router.post('/upload', 
  authenticateToken,
  uploadRateLimit, // 10 uploads per hour
  requestSizeLimit(50 * 1024 * 1024), // 50MB limit
  (_req, res) => {
    res.json({ message: 'File uploaded' });
  }
);

// Example 7: Search endpoint with higher rate limits
router.get('/search', 
  optionalAuth,
  getRateLimit('search'), // 200 requests per 15 minutes
  (req, res) => {
    res.json({ 
      results: [],
      query: req.query['q'] 
    });
  }
);

// Example 8: Admin panel with IP whitelisting
const adminRouter = Router();

// Apply IP whitelist to all admin routes
adminRouter.use(ipWhitelist(['192.168.1.100', '10.0.0.50']));
adminRouter.use(authenticateToken);
adminRouter.use(requireAdmin);

adminRouter.get('/dashboard', (_req, res) => {
  res.json({ message: 'Admin dashboard' });
});

adminRouter.get('/logs', (_req, res) => {
  res.json({ logs: [] });
});

// Mount admin router
router.use('/admin', adminRouter);

// Example 9: API creation endpoints with moderate rate limiting
router.post('/cases', 
  authenticateToken,
  getRateLimit('create'), // 30 requests per 10 minutes
  (_req, res) => {
    res.json({ message: 'Case created' });
  }
);

router.put('/cases/:id', 
  authenticateToken,
  getRateLimit('create'),
  (_req, res) => {
    res.json({ message: 'Case updated' });
  }
);

// Example 10: Combining multiple middleware for complex scenarios
router.post('/bulk-import', 
  authenticateToken,
  requireRole(['admin', 'data-manager']),
  uploadRateLimit,
  requestSizeLimit(100 * 1024 * 1024), // 100MB for bulk operations
  (_req, res) => {
    res.json({ message: 'Bulk import started' });
  }
);

// Example 11: Health check endpoint (no authentication, no rate limiting)
router.get('/health', (_req, res) => {
  // This endpoint bypasses most middleware for reliability
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Example 12: Metrics endpoint with IP whitelisting (for monitoring systems)
router.get('/metrics', 
  ipWhitelist(['127.0.0.1', '10.0.0.0/8']), // Allow localhost and private networks
  (_req, res) => {
    res.json({ 
      requests: 1000,
      errors: 5,
      uptime: process.uptime()
    });
  }
);

export { router as middlewareExamples };

/**
 * Common Middleware Patterns
 */

// Pattern 1: Standard API endpoint
export const standardApiEndpoint = [
  authenticateToken,
  getRateLimit('general')
];

// Pattern 2: Admin endpoint
export const adminEndpoint = [
  authenticateToken,
  requireAdmin,
  getRateLimit('general')
];

// Pattern 3: File upload endpoint
export const fileUploadEndpoint = [
  authenticateToken,
  uploadRateLimit,
  requestSizeLimit(10 * 1024 * 1024) // 10MB default
];

// Pattern 4: Public search endpoint
export const publicSearchEndpoint = [
  optionalAuth,
  getRateLimit('search')
];

// Pattern 5: Secure admin endpoint with IP restriction
export const secureAdminEndpoint = [
  ipWhitelist(['192.168.1.0/24']), // Admin network only
  authenticateToken,
  requireAdmin
];

/**
 * Usage of patterns:
 * 
 * router.get('/api/cases', ...standardApiEndpoint, getCasesHandler);
 * router.post('/api/admin/settings', ...adminEndpoint, updateSettingsHandler);
 * router.post('/api/upload', ...fileUploadEndpoint, uploadHandler);
 */