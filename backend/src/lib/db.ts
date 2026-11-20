import { PrismaClient } from '@prisma/client';

/**
 * Default: Prisma's standard engine.
 * Set DB_DRIVER=pg-adapter to use the pure-JavaScript Postgres driver instead
 * (useful on hosts where Prisma's engine binary can't be downloaded; requires
 * `engineType = "client"` in schema.prisma).
 */
function create(): PrismaClient {
  if (process.env.DB_DRIVER === 'pg-adapter') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require('@prisma/adapter-pg');
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }
  return new PrismaClient();
}

export const prisma = create();
