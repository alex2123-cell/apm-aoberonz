import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import Redis from 'ioredis';
import { config } from './config';
import { prisma } from './lib/db';
import { errorHandler } from './lib/http';
import { INDUSTRIES, COUNTIES } from './lib/constants';
import { authRouter } from './routes/auth';
import { feedRouter } from './routes/feed';
import { postsRouter } from './routes/posts';
import { meRouter } from './routes/me';
import { companiesRouter } from './routes/companies';
import { ingestRouter } from './routes/ingest';
import { reviewRouter } from './routes/review';

client.collectDefaultMetrics();
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

let redis: Redis | undefined;

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'https:'],
          'media-src': ["'self'", 'https:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'upgrade-insecure-requests': null, // allow plain http on localhost
        },
      },
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => end({ method: req.method, route: req.route?.path ?? req.baseUrl, status: res.statusCode }));
    next();
  });

  // Liveness: process is up. Readiness: dependencies answer. Load balancers and uptime monitors use these.
  app.get('/health/live', (_req, res) => res.json({ ok: true }));
  app.get('/health/ready', async (_req, res) => {
    const checks: Record<string, boolean> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }
    if (config.useQueues) {
      try {
        redis ??= new Redis(config.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
        checks.redis = (await redis.ping()) === 'PONG';
      } catch {
        checks.redis = false;
      }
    }
    const ok = Object.values(checks).every(Boolean);
    res.status(ok ? 200 : 503).json({ ok, checks });
  });
  app.get('/metrics', async (req, res) => {
    if (process.env.METRICS_TOKEN && req.header('authorization') !== `Bearer ${process.env.METRICS_TOKEN}`) {
      return res.status(401).end();
    }
    res.set('Content-Type', client.register.contentType);
    res.send(await client.register.metrics());
  });

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  api.get('/meta', (_req, res) => res.json({ industries: INDUSTRIES, counties: COUNTIES }));
  api.use('/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30 }), authRouter);
  api.use('/feed', feedRouter);
  api.use('/posts', postsRouter);
  api.use('/me', meRouter);
  api.use('/companies', companiesRouter);
  api.use('/ingest', ingestRouter);
  api.use('/review', reviewRouter);
  app.use('/api', api);

  // The web app (public/). Any other GET page path returns index.html so links like /p/<id> work.
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir, { maxAge: config.env === 'production' ? '1h' : 0, index: 'index.html' }));
  app.get(/^\/(?!api\/|health\/|metrics|socket\.io\/).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
