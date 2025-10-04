import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

import { authenticateToken, requireRole } from '@/middleware/auth';
import { uploadRateLimit, searchRateLimit } from '@/middleware/rateLimit';
import { importController } from '@/controllers/import';

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | void;

const asyncHandler = (handler: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

/**
 * @swagger
 * /import/csv:
 *   post:
 *     summary: Upload and process CSV file with case data
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: object
 *                 properties:
 *                   filename:
 *                     type: string
 *                     example: cases.csv
 *                   fileSize:
 *                     type: number
 *                     example: 1024
 *                   totalRecords:
 *                     type: number
 *                     example: 100
 *               payload:
 *                 type: object
 *                 properties:
 *                   cases:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         caseNumber:
 *                           type: string
 *                         courtName:
 *                           type: string
 *                         filedDate:
 *                           type: string
 *                           format: date
 *                   activities:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         caseId:
 *                           type: string
 *                         activityDate:
 *                           type: string
 *                           format: date
 *                         activityType:
 *                           type: string
 *     responses:
 *       202:
 *         description: CSV processing started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batchId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: completed
 *       400:
 *         description: Invalid request data
 */
router.post(
  '/csv',
  requireRole(['DATA_ENTRY', 'ADMIN']),
  uploadRateLimit,
  asyncHandler((req, res, next) => importController.uploadCsv(req, res, next))
);

/**
 * @swagger
 * /import/batches/recent:
 *   get:
 *     summary: Get recent import batches
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of batches to return
 *     responses:
 *       200:
 *         description: List of recent batches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batches:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       filename:
 *                         type: string
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
router.get(
  '/batches/recent',
  requireRole(['VIEWER', 'DATA_ENTRY', 'ADMIN']),
  asyncHandler((req, res, next) => importController.listRecentBatches(req, res, next))
);

/**
 * @swagger
 * /import/batches/{batchId}:
 *   get:
 *     summary: Get import batch status
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *       - in: query
 *         name: includeErrors
 *         schema:
 *           type: boolean
 *         description: Include error details
 *     responses:
 *       200:
 *         description: Batch status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                 successfulRecords:
 *                   type: number
 *                 failedRecords:
 *                   type: number
 *       404:
 *         description: Batch not found
 */
router.get(
  '/batches/:batchId',
  requireRole(['VIEWER', 'DATA_ENTRY', 'ADMIN']),
  asyncHandler((req, res, next) => importController.getBatchStatus(req, res, next))
);

/**
 * @swagger
 * /import/cases/export:
 *   get:
 *     summary: Export cases to CSV
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courtName
 *         schema:
 *           type: string
 *         description: Filter by court name
 *       - in: query
 *         name: caseTypeId
 *         schema:
 *           type: string
 *         description: Filter by case type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, RESOLVED, PENDING, TRANSFERRED, DELETED]
 *         description: Filter by case status
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *         description: Number of records per page
 *     produces:
 *       - text/csv
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get(
  '/cases/export',
  requireRole(['VIEWER', 'DATA_ENTRY', 'ADMIN']),
  searchRateLimit,
  asyncHandler((req, res, next) => importController.exportCases(req, res, next))
);

export { router as importRoutes };
