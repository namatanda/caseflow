import { Router } from 'express';
import { systemController } from '@/controllers/system';

const router = Router();

// Health check endpoint
router.get('/health', systemController.healthCheck);

// Detailed health check endpoint
router.get('/health/detailed', systemController.detailedHealthCheck);

// Metrics endpoint for Prometheus
router.get('/metrics', systemController.metrics);

// Version information
router.get('/version', systemController.version);

export { router as systemRoutes };