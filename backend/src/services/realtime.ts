import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../lib/logger';

/**
 * Live updates. The API server holds the socket connections; the worker process
 * publishes through Redis (redis-emitter), so every API instance can push to its clients.
 * Clients join rooms: "all", "industry:<name>", "company:<id>".
 */
let io: Server | undefined;
let emitter: Emitter | undefined;

export function attachRealtime(server: HttpServer): Server {
  io = new Server(server, { cors: { origin: config.corsOrigins } });
  if (config.useQueues) {
    const pub = new Redis(config.redisUrl);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
  }
  io.on('connection', (socket) => {
    socket.join('all');
    socket.on('subscribe', (rooms: unknown) => {
      if (!Array.isArray(rooms)) return;
      rooms
        .filter((r): r is string => typeof r === 'string' && /^(industry|company):[\w-]{1,60}$/.test(r))
        .slice(0, 30)
        .forEach((r) => socket.join(r));
    });
  });
  logger.info('Realtime ready');
  return io;
}

function getEmitter(): Emitter | undefined {
  if (!config.useQueues) return undefined;
  if (!emitter) emitter = new Emitter(new Redis(config.redisUrl));
  return emitter;
}

export interface NewPostSignal {
  id: string;
  headline: string;
  industry: string;
  companyId: string;
  publishedAt: string;
}

export function broadcastNewPost(p: NewPostSignal) {
  const target = io ?? getEmitter();
  if (!target) return;
  target.to(['all', `industry:${p.industry}`, `company:${p.companyId}`]).emit('post:new', p);
}
