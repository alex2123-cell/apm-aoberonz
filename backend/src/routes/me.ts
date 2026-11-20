import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { ah, HttpError } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { INDUSTRIES } from '../lib/constants';

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/', ah(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, name: true, email: true, role: true, companyId: true,
      interests: { select: { industry: true, weight: true }, orderBy: { weight: 'desc' } },
      follows: { select: { company: { select: { id: true, name: true, slug: true } } } },
    },
  });
  if (!user) throw new HttpError(404, 'User not found');
  res.json(user);
}));

meRouter.put('/interests', ah(async (req, res) => {
  const { industries } = z.object({ industries: z.array(z.enum(INDUSTRIES)).max(11) }).parse(req.body);
  const userId = req.user!.id;
  await prisma.$transaction([
    prisma.userInterest.deleteMany({ where: { userId, industry: { notIn: industries } } }),
    ...industries.map((industry) =>
      prisma.userInterest.upsert({
        where: { userId_industry: { userId, industry } },
        create: { userId, industry, weight: 3 },
        update: {},
      }),
    ),
  ]);
  res.json({ industries });
}));

meRouter.get('/saved', ah(async (req, res) => {
  const saves = await prisma.save.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { post: { include: { company: { select: { id: true, name: true, slug: true, verified: true } } } } },
  });
  res.json({ items: saves.map((s) => ({ ...s.post, saved: true })) });
}));

/** Data Protection Act: users can delete their account and data. */
meRouter.delete('/', ah(async (req, res) => {
  await prisma.user.delete({ where: { id: req.user!.id } });
  res.status(204).end();
}));
