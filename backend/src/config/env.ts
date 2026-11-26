import crypto from 'node:crypto';
import path from 'node:path';

const ephemeralAccessSecret = crypto.randomBytes(32).toString('hex');
const ephemeralRefreshSecret = crypto.randomBytes(32).toString('hex');

const rawOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (process.env.APP_URL) {
  rawOrigins.push(process.env.APP_URL.trim());
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  MONGODB_URI: (process.env.MONGODB_URI || '').trim(),
  JWT_ACCESS_SECRET: (process.env.JWT_ACCESS_SECRET || '').trim() || ephemeralAccessSecret,
  JWT_REFRESH_SECRET: (process.env.JWT_REFRESH_SECRET || '').trim() || ephemeralRefreshSecret,
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: 7,
  ADMIN_INITIAL_PASSWORD: (process.env.ADMIN_INITIAL_PASSWORD || '').trim(),
  CORS_ORIGINS: Array.from(new Set(['http://localhost:3000', 'http://127.0.0.1:3000', ...rawOrigins])),
  UPLOAD_MAX_BYTES: Math.max(1, Number(process.env.UPLOAD_MAX_MB || 5)) * 1024 * 1024,
  UPLOAD_DIR: path.resolve(process.cwd(), 'private_uploads'),
  DATA_DIR: path.resolve(process.cwd(), 'private_data'),
  SMTP_HOST: (process.env.SMTP_HOST || '').trim(),
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: (process.env.SMTP_USER || '').trim(),
  SMTP_PASS: (process.env.SMTP_PASS || '').trim(),
  SMTP_FROM: (process.env.SMTP_FROM || 'ResolveDesk <no-reply@resolvedesk.edu>').trim(),
  SLA_CHECK_INTERVAL_MS: Math.max(15000, Number(process.env.SLA_CHECK_INTERVAL_MS || 60000)),
};
