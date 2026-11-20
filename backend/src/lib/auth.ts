import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { config } from '../config';
import { HttpError } from './http';

export interface AuthUser {
  id: string;
  role: Role;
  companyId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as SignOptions);
}

function readToken(req: Request): AuthUser | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  try {
    const p = jwt.verify(header.slice(7), config.jwtSecret) as AuthUser;
    return { id: p.id, role: p.role, companyId: p.companyId ?? null };
  } catch {
    return undefined;
  }
}

/** Attaches req.user when a valid token is present; never blocks. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = readToken(req);
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = readToken(req);
  if (!req.user) return next(new HttpError(401, 'Please log in'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user ??= readToken(req);
    if (!req.user) return next(new HttpError(401, 'Please log in'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Not allowed'));
    next();
  };
}

/** Device API keys: shown once, stored only as a SHA-256 hash. */
export function newDeviceKey(): { key: string; prefix: string; hash: string } {
  const key = `aob_${crypto.randomBytes(24).toString('base64url')}`;
  return { key, prefix: key.slice(0, 10), hash: hashKey(key) };
}

export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
