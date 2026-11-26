import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { db } from './backend/src/config/database';
import { env } from './backend/src/config/env';
import { startSlaScheduler } from './backend/src/jobs/slaEscalationJob';
import { apiLimiter, errorHandler, isOriginAllowed, noSqlSanitizer } from './backend/src/middleware/security';
import adminRoutes from './backend/src/routes/adminRoutes';
import attachmentRoutes from './backend/src/routes/attachmentRoutes';
import authRoutes from './backend/src/routes/authRoutes';
import complaintRoutes from './backend/src/routes/complaintRoutes';
import departmentRoutes from './backend/src/routes/departmentRoutes';
import { initSocketServer } from './backend/src/services/socketService';

async function bootstrap() {
  await db.init();
  startSlaScheduler();

  const app = express();
  app.set('trust proxy', 1);

  // Security headers (configured cleanly for embedded iframe preview & Fonts)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Strict per-request CORS allowlist (exact allowlist or exact same-host match; never wildcard *.run.app)
  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
      if (isOriginAllowed(origin, host)) {
        return callback(null, { origin: true, credentials: true });
      }
      const err = new Error('Origin not permitted by CORS policy') as Error & { status?: number };
      err.status = 403;
      return callback(err);
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(noSqlSanitizer);
  app.use('/api', apiLimiter);

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      databaseMode: db.mode,
      timestamp: new Date().toISOString(),
    });
  });

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api', adminRoutes);

  // Centralized API error handler
  app.use('/api', errorHandler);

  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  if (env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[ResolveDesk] Full-stack server + Socket.IO listening on http://0.0.0.0:${env.PORT}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('[ResolveDesk] Fatal boot error:', err);
  process.exit(1);
});
