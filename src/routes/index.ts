import { Router } from 'express';
import { systemRoutes } from './system';

const router = Router();

// System routes (health, metrics, etc.)
router.use('/system', systemRoutes);

// Placeholder for other routes that will be added in subsequent tasks
// router.use('/auth', authRoutes);
// router.use('/dashboard', dashboardRoutes);
// router.use('/cases', caseRoutes);
// router.use('/import', importRoutes);

export { router as apiRoutes };