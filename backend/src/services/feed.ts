import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { rankFeed, type Candidate, type UserSignals, INTEREST_DELTAS, nextInterestWeight } from './ranking';

export type FeedTab = 'foryou' | 'following' | 'latest';

const postSelect = {
  id: true,
  headline: true,
  summary: true,
  industry: true,
  county: true,
  mediaUrl: true,
  mediaType: true,
  tags: true,
  language: true,
  aiGenerated: true,
  confidence: true,
  publishedAt: true,
  likeCount: true,
  saveCount: true,
  shareCount: true,
  viewCount: true,
  companyId: true,
  company: { select: { id: true, name: true, slug: true, verified: true, logoUrl: true, industry: true } },
} satisfies Prisma.PostSelect;

export type FeedPost = Prisma.PostGetPayload<{ select: typeof postSelect }> & { liked?: boolean; saved?: boolean };

async function loadSignals(userId: string): Promise<UserSignals> {
  const [interests, follows] = await Promise.all([
    prisma.userInterest.findMany({ where: { userId } }),
    prisma.follow.findMany({ where: { userId }, select: { companyId: true } }),
  ]);
  return {
    interests: Object.fromEntries(interests.map((i) => [i.industry, i.weight])),
    followedCompanyIds: new Set(follows.map((f) => f.companyId)),
  };
}

async function decorate(posts: FeedPost[], userId?: string): Promise<FeedPost[]> {
  if (!userId || !posts.length) return posts;
  const ids = posts.map((p) => p.id);
  const [likes, saves] = await Promise.all([
    prisma.like.findMany({ where: { userId, postId: { in: ids } }, select: { postId: true } }),
    prisma.save.findMany({ where: { userId, postId: { in: ids } }, select: { postId: true } }),
  ]);
  const l = new Set(likes.map((x) => x.postId));
  const s = new Set(saves.map((x) => x.postId));
  return posts.map((p) => ({ ...p, liked: l.has(p.id), saved: s.has(p.id) }));
}

export interface FeedQuery {
  tab: FeedTab;
  userId?: string;
  industry?: string;
  county?: string;
  cursor?: string; // ISO date for latest/following
  exclude?: string[]; // ids already shown in this session (foryou)
  limit: number;
}

export async function getFeed(q: FeedQuery): Promise<{ items: FeedPost[]; nextCursor: string | null }> {
  const base: Prisma.PostWhereInput = {
    status: 'PUBLISHED',
    ...(q.industry ? { industry: q.industry } : {}),
    ...(q.county ? { county: q.county } : {}),
  };

  if (q.tab === 'latest' || q.tab === 'following') {
    const where: Prisma.PostWhereInput = { ...base, ...(q.cursor ? { publishedAt: { lt: new Date(q.cursor) } } : {}) };
    if (q.tab === 'following') {
      if (!q.userId) return { items: [], nextCursor: null };
      const follows = await prisma.follow.findMany({ where: { userId: q.userId }, select: { companyId: true } });
      where.companyId = { in: follows.map((f) => f.companyId) };
    }
    const items = await prisma.post.findMany({ where, select: postSelect, orderBy: { publishedAt: 'desc' }, take: q.limit });
    const last = items.at(-1);
    return {
      items: await decorate(items, q.userId),
      nextCursor: items.length === q.limit && last?.publishedAt ? last.publishedAt.toISOString() : null,
    };
  }

  // For You: pull a candidate pool from the last 7 days, drop what this user has seen recently, rank.
  const since = new Date(Date.now() - 7 * 24 * 3_600_000);
  const seenIds = new Set(q.exclude ?? []);
  if (q.userId) {
    const seen = await prisma.interaction.findMany({
      where: { userId: q.userId, createdAt: { gte: new Date(Date.now() - 72 * 3_600_000) } },
      select: { postId: true },
      take: 2000,
    });
    seen.forEach((s) => seenIds.add(s.postId));
  }
  let pool = await prisma.post.findMany({
    where: { ...base, publishedAt: { gte: since }, id: { notIn: [...seenIds].slice(0, 5000) } },
    select: postSelect,
    orderBy: { publishedAt: 'desc' },
    take: 400,
  });
  // Never show an empty feed: fall back to older posts.
  if (pool.length < q.limit) {
    const older = await prisma.post.findMany({
      where: { ...base, id: { notIn: [...seenIds, ...pool.map((p) => p.id)] } },
      select: postSelect,
      orderBy: { publishedAt: 'desc' },
      take: q.limit * 3,
    });
    pool = pool.concat(older);
  }
  const signals = q.userId ? await loadSignals(q.userId) : null;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const candidates: Candidate[] = pool.map((p) => ({
    id: p.id,
    companyId: p.companyId,
    industry: p.industry,
    publishedAt: p.publishedAt ?? new Date(0),
    likeCount: p.likeCount,
    saveCount: p.saveCount,
    shareCount: p.shareCount,
    viewCount: p.viewCount,
    confidence: p.confidence,
    verified: p.company.verified,
  }));
  const ranked = rankFeed(candidates, signals, { limit: q.limit }).map((c) => byId.get(c.id)!);
  return { items: await decorate(ranked, q.userId), nextCursor: ranked.length ? 'more' : null };
}

/** Nudge a user's interest in an industry after an action. */
export async function bumpInterest(userId: string, industry: string, delta: number) {
  const cur = await prisma.userInterest.findUnique({ where: { userId_industry: { userId, industry } } });
  const weight = nextInterestWeight(cur?.weight ?? 0, delta);
  await prisma.userInterest.upsert({
    where: { userId_industry: { userId, industry } },
    create: { userId, industry, weight },
    update: { weight },
  });
}

export { INTEREST_DELTAS };
