import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8080,http://localhost:3000').split(','),
  // Risk gate: below this confidence an update waits for a human
  autoPublishMinConfidence: Number(process.env.AUTO_PUBLISH_MIN_CONFIDENCE ?? 0.75),
  // AI writer (optional). Without a key the rule-based writer is used.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  aiModel: process.env.AI_MODEL ?? 'claude-haiku-5-5',
  // Set to "false" to run the processing inline (handy for tests / tiny deployments)
  useQueues: (process.env.USE_QUEUES ?? 'true') !== 'false',
};
