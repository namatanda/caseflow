import {
	Router,
	type NextFunction,
	type Request,
	type RequestHandler,
	type Response,
	type Router as RouterType
} from 'express';
import { systemController } from '@/controllers/system';

const router: RouterType = Router();

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

/**
 * @swagger
 * /system/health:
 *   get:
 *     summary: Basic health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 environment:
 *                   type: string
 *       503:
 *         description: Service is unhealthy
 */
router.get(
	'/health',
	asyncHandler((req, res, next) => systemController.healthCheck(req, res, next))
);

/**
 * @swagger
 * /system/health/detailed:
 *   get:
 *     summary: Detailed health check with system diagnostics
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Detailed health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 environment:
 *                   type: string
 *                 version:
 *                   type: string
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         responseTime:
 *                           type: number
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         responseTime:
 *                           type: number
 *                     memory:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         usage:
 *                           type: object
 *                           properties:
 *                             used:
 *                               type: number
 *                             total:
 *                               type: number
 *                             percentage:
 *                               type: number
 *                     disk:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *       503:
 *         description: Service is unhealthy
 */
router.get(
	'/health/detailed',
	asyncHandler((req, res, next) => systemController.detailedHealthCheck(req, res, next))
);

/**
 * @swagger
 * /system/metrics:
 *   get:
 *     summary: Prometheus metrics
 *     tags: [System]
 *     produces:
 *       - text/plain
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       500:
 *         description: Failed to collect metrics
 */
router.get(
	'/metrics',
	asyncHandler((req, res, next) => systemController.metrics(req, res, next))
);

/**
 * @swagger
 * /system/version:
 *   get:
 *     summary: API version information
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Version information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: CourtFlow Backend API
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 apiVersion:
 *                   type: string
 *                   example: v1
 *                 nodeVersion:
 *                   type: string
 *                   example: v18.17.0
 *                 environment:
 *                   type: string
 *                   example: development
 *                 buildDate:
 *                   type: string
 *                   format: date-time
 */
router.get(
	'/version',
	asyncHandler((req, res, next) => systemController.version(req, res, next))
);

export { router as systemRoutes };