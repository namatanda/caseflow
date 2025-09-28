import {
	Router,
	type NextFunction,
	type Request,
	type RequestHandler,
	type Response
} from 'express';
import { systemController } from '@/controllers/system';

const router = Router();

type AsyncHandler = (
	req: Request,
	res: Response,
	next: NextFunction
) => Promise<unknown> | void;

const asyncHandler = (handler: AsyncHandler): RequestHandler => {
	return (req, res, next) => {
		Promise.resolve(handler(req, res, next)).catch(next);
	};
};

// Health check endpoint
router.get(
	'/health',
	asyncHandler((req, res, next) => systemController.healthCheck(req, res, next))
);

// Detailed health check endpoint
router.get(
	'/health/detailed',
	asyncHandler((req, res, next) => systemController.detailedHealthCheck(req, res, next))
);

// Metrics endpoint for Prometheus
router.get(
	'/metrics',
	asyncHandler((req, res, next) => systemController.metrics(req, res, next))
);

// Version information
router.get(
	'/version',
	asyncHandler((req, res, next) => systemController.version(req, res, next))
);

export { router as systemRoutes };