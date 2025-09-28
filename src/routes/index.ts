import { Router } from 'express';
import { systemRoutes } from './system';
import { importRoutes } from './import';

const router = Router();

// System routes (health, metrics, etc.)
router.use('/system', systemRoutes);

// Import/export routes
router.use('/import', importRoutes);

// Placeholder for other routes that will be added in subsequent tasks
// router.use('/auth', authRoutes);
// router.use('/dashboard', dashboardRoutes);
// router.use('/cases', caseRoutes);

export { router as apiRoutes };