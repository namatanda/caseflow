import { Router, type Router as RouterType, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { authenticateToken } from '@/middleware/auth';
import { systemRoutes } from './system';
import { importRoutes } from './import';
import authRoutes from './auth';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | void;

const asyncHandler = (handler: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

const router: RouterType = Router();

// Public routes (no authentication required)
router.use('/system', systemRoutes); // Health checks, metrics, version info
router.use('/auth', authRoutes);     // Login, register, refresh, logout, profile, change-password

// Apply global authentication to all other routes
router.use(asyncHandler(authenticateToken));

// Protected routes (authentication required)
router.use('/import', importRoutes);

// Placeholder for other routes that will be added in subsequent tasks
// router.use('/dashboard', dashboardRoutes);
// router.use('/cases', caseRoutes);

export { router as apiRoutes };