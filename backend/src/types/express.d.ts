import type { AuthenticatedUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
      user?: AuthenticatedUser;
    }
  }
}

export {};
