import { Worker } from 'bullmq';
import { connection } from '../services/queues';
import { processEvent, runPublishJob } from '../services/pipeline';
import { logger } from '../lib/logger';
import { prisma } from '../lib/db';

/**
 * Background worker. Run as many copies as you need (they share the Redis queues).
 *   npm run start:worker
 */
const events = new Worker(
  'events',
  async (job) => processEvent(job.data.eventId as string),
  { connection, concurrency: Number(process.env.EVENT_CONCURRENCY ?? 8) },
);

const distribution = new Worker(
  'distribution',
  async (job) => runPublishJob(job.data.jobId as string),
  { connection, concurrency: Number(process.env.DISTRIBUTION_CONCURRENCY ?? 4) },
);

for (const w of [events, distribution]) {
  w.on('failed', (job, err) => logger.warn({ queue: w.name, jobId: job?.id, err: err.message }, 'job failed'));
  w.on('completed', (job) => logger.debug({ queue: w.name, jobId: job.id }, 'job done'));
}
logger.info('Aoberonz worker started');

async function shutdown() {
  await Promise.all([events.close(), distribution.close()]);
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
