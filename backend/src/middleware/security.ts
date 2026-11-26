import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { db, UserDoc } from '../config/database';
import { env } from '../config/env';
import { isOriginHostMatch, sanitizeNoSqlPayload, UserRole } from '../utils/domainRules';

export interface AuthenticatedRequest extends Request {
  user?: UserDoc;
  sessionId?: string;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  sid: string;
  email: string;
}

export function signAccessToken(user: UserDoc, sessionId: string): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    sid: sessionId,
    email: user.email,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] });
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sid: sessionId }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function isOriginAllowed(origin: string | undefined, hostHeader?: string): boolean {
  if (!origin) return true;
  if (env.CORS_ORIGINS.includes(origin)) return true;
  if (hostHeader && isOriginHostMatch(origin, hostHeader)) return true;
  return false;
}

export function setRefreshCookie(res: Response, token: string): void {
  const maxAgeMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  const parts = [
    `rd_refresh=${encodeURIComponent(token)}`,
    'Path=/api/auth',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearRefreshCookie(res: Response): void {
  const parts = [
    'rd_refresh=',
    'Path=/api/auth',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
    'Max-Age=0',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function noSqlSanitizer(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeNoSqlPayload(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    const sanitized = sanitizeNoSqlPayload(req.query);
    for (const key of Object.keys(req.query)) {
      if (!(key in sanitized)) delete (req.query as Record<string, unknown>)[key];
    }
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeNoSqlPayload(req.params);
  }
  next();
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  const hasCustomHeader = req.headers['x-requested-with'] === 'ResolveDesk';
  const origin = req.headers.origin;
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  if (hasCustomHeader && (!origin || isOriginAllowed(origin, forwardedHost))) {
    return next();
  }
  if (isOriginHostMatch(origin, forwardedHost)) {
    return next();
  }
  res.status(403).json({ error: 'CSRF validation failed. Missing or mismatched origin.' });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    const user = db.state.users.find((u) => u.id === decoded.sub);
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Account is inactive or not found.' });
      return;
    }
    const session = db.state.sessions.find((s) => s.id === decoded.sid && !s.revokedAt);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      res.status(401).json({ error: 'Session expired or revoked. Please sign in again.' });
      return;
    }
    req.user = user;
    req.sessionId = session.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action.' });
      return;
    }
    next();
  };
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

export const trackingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Tracking lookup rate limit exceeded. Please wait a few minutes.' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API rate limit exceeded. Please slow down.' },
});

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = (err as { status?: number })?.status || 500;
  if (status >= 500) {
    console.error('[API Error]', message);
  }
  res.status(status).json({
    error: status >= 500 ? 'An unexpected server error occurred.' : message,
  });
}
