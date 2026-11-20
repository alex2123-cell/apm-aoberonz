import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { ah, HttpError } from '../lib/http';
import { requireRole } from '../lib/auth';
import { publishPost } from '../services/pipeline';

/** The human side of the risk gate: approve, edit or reject drafts. */
export const reviewRouter = Router();
reviewRouter.use(requireRole('COMPANY_ADMIN', 'EDITOR', 'ADMIN'));

function scope(user: Express.Request['user']): Prisma.PostWhereInput {
  // Company admins only see their own company's drafts; editors and admins see all.
  return user?.role === 'COMPANY_ADMIN' ? { companyId: user.companyId ?? '__none__' } : {};
}

reviewRouter.get('/queue', ah(async (req, res) => {
  const items = await prisma.post.findMany({
    where: { status: 'PENDING_REVIEW', ...scope(req.user) },
    orderBy: [{ risk: 'desc' }, { createdAt: 'asc' }],
    take: 50,
    include: {
      company: { select: { name: true, slug: true } },
      event: { select: { kind: true, labels: true, confidence: true, transcript: true, mediaUrl: true, capturedAt: true } },
    },
  });
  res.json({ items });
}));

async function loadPending(id: string, user: Express.Request['user']) {
  const post = await prisma.post.findFirst({ where: { id, ...scope(user) } });
  if (!post) throw new HttpError(404, 'Draft not found');
  if (post.status !== 'PENDING_REVIEW') throw new HttpError(409, 'Already reviewed');
  return post;
}

const editSchema = z.object({
  headline: z.string().min(5).max(140).optional(),
  summary: z.string().min(10).max(3000).optional(),
  note: z.string().max(500).optional(),
});

reviewRouter.post('/:id/approve', ah(async (req, res) => {
  const post = await loadPending(req.params.id, req.user);
  const edits = editSchema.parse(req.body ?? {});
  if (edits.headline || edits.summary) {
    await prisma.post.update({
      where: { id: post.id },
      data: { headline: edits.headline, summary: edits.summary, reviewNote: edits.note },
    });
    await prisma.auditLog.create({
      data: {
        postId: post.id, actorId: req.user!.id, action: 'edited',
        detail: { before: { headline: post.headline, summary: post.summary }, after: edits },
      },
    });
  }
  const published = await publishPost(post.id, req.user!.id);
  res.json(published);
}));

reviewRouter.post('/:id/reject', ah(async (req, res) => {
  const post = await loadPending(req.params.id, req.user);
  const { note } = editSchema.parse(req.body ?? {});
  await prisma.post.update({ where: { id: post.id }, data: { status: 'REJECTED', reviewNote: note, reviewedById: req.user!.id } });
  await prisma.auditLog.create({ data: { postId: post.id, actorId: req.user!.id, action: 'rejected', detail: { note } } });
  res.json({ ok: true });
}));

reviewRouter.get('/:id/audit', ah(async (req, res) => {
  const post = await prisma.post.findFirst({ where: { id: req.params.id, ...scope(req.user) }, select: { id: true } });
  if (!post) throw new HttpError(404, 'Not found');
  const items = await prisma.auditLog.findMany({ where: { postId: post.id }, orderBy: { createdAt: 'asc' } });
  res.json({ items });
}));
