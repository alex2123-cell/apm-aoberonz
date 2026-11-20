import { prisma } from '../lib/db';
import { logger } from '../lib/logger';
import { config } from '../config';
import { writeDraft } from './ai';
import { canAutoPublish } from './riskGate';
import { broadcastNewPost } from './realtime';
import { adapters, type PostWithCompany } from './publisher';
import { enqueueDistribution } from './queues';

/** Step 1: event from a device -> draft post -> risk gate. */
export async function processEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { device: { include: { company: true } }, post: true },
  });
  if (!event || event.post) return; // already done (jobs can retry)
  const company = event.device.company;

  const draft = await writeDraft({
    kind: event.kind,
    labels: event.labels,
    transcript: event.transcript,
    text: event.text,
    reading: event.reading,
    companyName: company.name,
    industry: company.industry,
    location: event.device.location ?? company.county,
    deviceType: event.device.type,
  });

  const autoPublish = canAutoPublish({
    risk: draft.risk,
    confidence: event.confidence,
    companyAutoPublish: company.autoPublish,
    minConfidence: config.autoPublishMinConfidence,
  });

  const post = await prisma.post.create({
    data: {
      companyId: company.id,
      eventId: event.id,
      headline: draft.headline,
      summary: draft.summary,
      tags: draft.tags,
      language: draft.language,
      industry: company.industry,
      county: company.county,
      mediaUrl: event.mediaUrl,
      mediaType: event.mediaUrl ? guessMediaType(event.mediaUrl) : null,
      risk: draft.risk,
      confidence: event.confidence,
      aiGenerated: true,
      status: 'PENDING_REVIEW',
    },
  });
  await prisma.event.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      postId: post.id,
      action: 'draft_created',
      detail: { eventId: event.id, risk: draft.risk, confidence: event.confidence, autoPublish },
    },
  });

  if (autoPublish) await publishPost(post.id, null);
  return post.id;
}

/** Step 2: make a post live in the app and queue it for every active channel. */
export async function publishPost(postId: string, actorId: string | null) {
  const post = await prisma.post.update({
    where: { id: postId },
    data: { status: 'PUBLISHED', publishedAt: new Date(), reviewedById: actorId ?? undefined },
  });
  await prisma.auditLog.create({ data: { postId, actorId, action: actorId ? 'approved' : 'auto_published' } });

  broadcastNewPost({
    id: post.id,
    headline: post.headline,
    industry: post.industry,
    companyId: post.companyId,
    publishedAt: post.publishedAt!.toISOString(),
  });

  const channels = await prisma.channel.findMany({ where: { companyId: post.companyId, active: true } });
  for (const ch of channels) {
    const job = await prisma.publishJob.create({ data: { postId, channelId: ch.id } });
    await enqueueDistribution(job.id);
  }
  return post;
}

/** Step 3: send one post to one channel. Throws so the queue retries with backoff. */
export async function runPublishJob(jobId: string) {
  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    include: { channel: true, post: { include: { company: true } } },
  });
  if (!job || job.status === 'SENT') return;
  try {
    const externalId = await adapters[job.channel.platform].send(
      job.post as PostWithCompany,
      job.channel.config as Record<string, string>,
    );
    await prisma.publishJob.update({
      where: { id: jobId },
      data: { status: 'SENT', externalId, attempts: { increment: 1 }, error: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.publishJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', attempts: { increment: 1 }, error: message.slice(0, 500) },
    });
    logger.warn({ jobId, platform: job.channel.platform, message }, 'Distribution failed');
    throw err;
  }
}

function guessMediaType(url: string): string {
  if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|aac|wav|ogg)(\?|$)/i.test(url)) return 'audio';
  return 'image';
}
