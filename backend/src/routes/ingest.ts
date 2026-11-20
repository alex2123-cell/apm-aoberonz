import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { ah, HttpError } from '../lib/http';
import { hashKey } from '../lib/auth';
import { enqueueEvent } from '../services/queues';

/**
 * Edge agents (cameras, TVs, radios, sensors, company systems) send events here.
 * Header: x-device-key: aob_...
 * The agent sends what it detected, never raw continuous footage.
 */
export const ingestRouter = Router();

ingestRouter.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const eventSchema = z.object({
  kind: z.string().regex(/^[a-z_]{2,40}$/),
  labels: z.array(z.string().max(40)).max(20).default([]),
  confidence: z.number().min(0).max(1),
  capturedAt: z.coerce.date().optional(),
  transcript: z.string().max(5000).optional(),
  text: z.string().max(5000).optional(),
  mediaUrl: z.string().url().max(1000).optional(),
  reading: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});

ingestRouter.post('/events', ah(async (req, res) => {
  const key = req.header('x-device-key');
  if (!key) throw new HttpError(401, 'Missing x-device-key');
  const device = await prisma.device.findUnique({ where: { apiKeyHash: hashKey(key) } });
  if (!device || !device.active) throw new HttpError(401, 'Unknown or disabled device');

  const body = eventSchema.parse(req.body);
  const event = await prisma.event.create({
    data: {
      deviceId: device.id,
      kind: body.kind,
      labels: body.labels,
      confidence: body.confidence,
      capturedAt: body.capturedAt ?? new Date(),
      transcript: body.transcript,
      text: body.text,
      mediaUrl: body.mediaUrl,
      reading: body.reading as Prisma.InputJsonValue | undefined,
    },
  });
  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  await enqueueEvent(event.id);
  res.status(202).json({ eventId: event.id });
}));

/** Lightweight heartbeat so the dashboard can show devices that went silent. */
ingestRouter.post('/heartbeat', ah(async (req, res) => {
  const key = req.header('x-device-key');
  if (!key) throw new HttpError(401, 'Missing x-device-key');
  const device = await prisma.device.update({
    where: { apiKeyHash: hashKey(key) },
    data: { lastSeenAt: new Date() },
  }).catch(() => null);
  if (!device) throw new HttpError(401, 'Unknown device');
  res.json({ ok: true });
}));
