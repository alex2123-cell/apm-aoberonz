import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({ error: 'Something went wrong' });
}
