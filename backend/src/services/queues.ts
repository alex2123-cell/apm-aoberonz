import { Queue } from 'bullmq';
import { config } from '../config';
import { logger } from '../lib/logger';

/**
 * Two queues on Redis:
 *   events       - turn a raw device event into a post (AI + risk gate)
 *   distribution - send a published post to one external channel
 * With USE_QUEUES=false work runs inline (tests, very small installs).
 */
export const connection = { url: config.redisUrl };

let eventsQueue: Queue | undefined;
let distributionQueue: Queue | undefined;

const retry = { attempts: 5, backoff: { type: 'exponential' as const, delay: 5_000 }, removeOnComplete: 1000, removeOnFail: 5000 };

export async function enqueueEvent(eventId: string) {
  if (!config.useQueues) {
    const { processEvent } = await import('./pipeline.js');
    await processEvent(eventId);
    return;
  }
  eventsQueue ??= new Queue('events', { connection });
  await eventsQueue.add('process', { eventId }, { ...retry, jobId: `event-${eventId}` });
}

export async function enqueueDistribution(jobId: string) {
  if (!config.useQueues) {
    const { runPublishJob } = await import('./pipeline.js');
    await runPublishJob(jobId).catch((err: unknown) => logger.warn({ err }, 'inline distribution failed'));
    return;
  }
  distributionQueue ??= new Queue('distribution', { connection });
  await distributionQueue.add('send', { jobId }, { ...retry, jobId: `pub-${jobId}` });
}
