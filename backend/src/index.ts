import http from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/db';
import { attachRealtime } from './services/realtime';

const app = createApp();
const server = http.createServer(app);
attachRealtime(server);

server.listen(config.port, () => logger.info(`Aoberonz API listening on :${config.port}`));

// Graceful shutdown: finish in-flight requests so rolling deploys drop nothing.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
