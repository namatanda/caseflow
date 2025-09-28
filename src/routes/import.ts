import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

import { importController } from '@/controllers/import';

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | void;

const asyncHandler = (handler: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

router.post(
  '/csv',
  asyncHandler((req, res, next) => importController.uploadCsv(req, res, next))
);

router.get(
  '/batches/recent',
  asyncHandler((req, res, next) => importController.listRecentBatches(req, res, next))
);

router.get(
  '/batches/:batchId',
  asyncHandler((req, res, next) => importController.getBatchStatus(req, res, next))
);

router.get(
  '/cases/export',
  asyncHandler((req, res, next) => importController.exportCases(req, res, next))
);

export { router as importRoutes };
