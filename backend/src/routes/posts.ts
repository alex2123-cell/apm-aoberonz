import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { ah, HttpError } from '../lib/http';
import { optionalAuth, requireAuth } from '../lib/auth';
import { bumpInterest, INTEREST_DELTAS } from '../services/feed';

export const postsRouter = Router();

postsRouter.get(
  '/:id',
  optionalAuth,
  ah(async (req, res) => {
    const post = await prisma.post.findFirst({
      where: { id: req.params.id, status: 'PUBLISHED' },
      include: { company: { select: { id: true, name: true, slug: true, verified: true, logoUrl: true } } },
    });
    if (!post) throw new HttpError(404, 'Post not found');
    res.json(post);
  }),
);

async function toggle(kind: 'like' | 'save', userId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { industry: true } });
  if (!post) throw new HttpError(404, 'Post not found');
  const key = { userId_postId: { userId, postId } };
  const countField = kind === 'like' ? 'likeCount' : 'saveCount';
  const existing = kind === 'like' ? await prisma.like.findUnique({ where: key }) : await prisma.save.findUnique({ where: key });
  if (existing) {
    await prisma.$transaction([
      kind === 'like' ? prisma.like.delete({ where: key }) : prisma.save.delete({ where: key }),
      prisma.post.update({ where: { id: postId }, data: { [countField]: { decrement: 1 } } }),
    ]);
    return false;
  }
  await prisma.$transaction([
    kind === 'like' ? prisma.like.create({ data: { userId, postId } }) : prisma.save.create({ data: { userId, postId } }),
    prisma.post.update({ where: { id: postId }, data: { [countField]: { increment: 1 } } }),
  ]);
  await bumpInterest(userId, post.industry, kind === 'like' ? INTEREST_DELTAS.LIKE : INTEREST_DELTAS.SAVE);
  return true;
}

postsRouter.post('/:id/like', requireAuth, ah(async (req, res) => {
  res.json({ liked: await toggle('like', req.user!.id, req.params.id) });
}));

postsRouter.post('/:id/save', requireAuth, ah(async (req, res) => {
  res.json({ saved: await toggle('save', req.user!.id, req.params.id) });
}));

postsRouter.post('/:id/share', optionalAuth, ah(async (req, res) => {
  const post = await prisma.post.update({ where: { id: req.params.id }, data: { shareCount: { increment: 1 } } });
  if (req.user) {
    await prisma.interaction.create({ data: { userId: req.user.id, postId: post.id, type: 'SHARE' } });
    await bumpInterest(req.user.id, post.industry, INTEREST_DELTAS.SHARE);
  }
  res.json({ url: `${process.env.PUBLIC_WEB_URL ?? 'https://aoberonz.com'}/p/${post.id}` });
}));

/**
 * Users report a wrong or harmful post. Three different reporters pull it back into the
 * review queue (hidden from feeds) until an editor decides.
 */
const REPORTS_TO_HIDE = 3;
postsRouter.post('/:id/report', requireAuth, ah(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(2).max(300) }).parse(req.body);
  const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
  if (!post) throw new HttpError(404, 'Post not found');
  const already = await prisma.auditLog.findFirst({ where: { postId: post.id, action: 'reported', actorId: req.user!.id } });
  if (!already) {
    await prisma.auditLog.create({ data: { postId: post.id, actorId: req.user!.id, action: 'reported', detail: { reason } } });
  }
  const reporters = await prisma.auditLog.count({ where: { postId: post.id, action: 'reported' } });
  let hidden = false;
  if (reporters >= REPORTS_TO_HIDE && post.status === 'PUBLISHED') {
    await prisma.post.update({ where: { id: post.id }, data: { status: 'PENDING_REVIEW', reviewNote: `Pulled after ${reporters} reports` } });
    await prisma.auditLog.create({ data: { postId: post.id, action: 'hidden_by_reports', detail: { reporters } } });
    hidden = true;
  }
  res.json({ received: true, hidden });
}));

/**
 * Batched view tracking from the app. The app sends how long each card was on screen.
 * < 1.5 s = skip (interest down a little), >= 5 s = long view (interest up).
 */
const interactionsSchema = z.object({
  events: z.array(z.object({ postId: z.string().max(40), dwellMs: z.number().int().min(0).max(3_600_000) })).max(50),
});

postsRouter.post('/interactions/batch', requireAuth, ah(async (req, res) => {
  const { events } = interactionsSchema.parse(req.body);
  const posts = await prisma.post.findMany({
    where: { id: { in: events.map((e) => e.postId) } },
    select: { id: true, industry: true },
  });
  const industry = new Map(posts.map((p) => [p.id, p.industry]));
  const valid = events.filter((e) => industry.has(e.postId));
  await prisma.interaction.createMany({
    data: valid.map((e) => ({
      userId: req.user!.id,
      postId: e.postId,
      type: e.dwellMs < 1500 ? 'SKIP' : 'VIEW',
      dwellMs: e.dwellMs,
    })),
  });
  await Promise.all(valid.map((e) => prisma.post.update({ where: { id: e.postId }, data: { viewCount: { increment: 1 } } })));
  for (const e of valid) {
    if (e.dwellMs < 1500) await bumpInterest(req.user!.id, industry.get(e.postId)!, INTEREST_DELTAS.SKIP);
    else if (e.dwellMs >= 5000) await bumpInterest(req.user!.id, industry.get(e.postId)!, INTEREST_DELTAS.LONG_VIEW);
  }
  res.json({ recorded: valid.length });
}));
