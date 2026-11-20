import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { ah, HttpError } from '../lib/http';
import { optionalAuth, requireAuth, requireRole, newDeviceKey } from '../lib/auth';
import { INDUSTRIES } from '../lib/constants';
import { bumpInterest, INTEREST_DELTAS } from '../services/feed';

export const companiesRouter = Router();

companiesRouter.get('/', ah(async (req, res) => {
  const industry = typeof req.query.industry === 'string' ? req.query.industry : undefined;
  const companies = await prisma.company.findMany({
    where: industry ? { industry } : {},
    select: { id: true, name: true, slug: true, industry: true, county: true, verified: true, logoUrl: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  res.json({ items: companies });
}));

companiesRouter.get('/:slug', optionalAuth, ah(async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { slug: req.params.slug },
    select: {
      id: true, name: true, slug: true, industry: true, county: true, verified: true, logoUrl: true,
      _count: { select: { followers: true, posts: { where: { status: 'PUBLISHED' } } } },
    },
  });
  if (!company) throw new HttpError(404, 'Company not found');
  const following = req.user
    ? !!(await prisma.follow.findUnique({ where: { userId_companyId: { userId: req.user.id, companyId: company.id } } }))
    : false;
  res.json({ ...company, following });
}));

const companySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  industry: z.enum(INDUSTRIES),
  county: z.string().max(40).optional(),
  verified: z.boolean().optional(),
  autoPublish: z.boolean().optional(),
});

companiesRouter.post('/', requireRole('ADMIN'), ah(async (req, res) => {
  const company = await prisma.company.create({ data: companySchema.parse(req.body) });
  res.status(201).json(company);
}));

companiesRouter.post('/:id/follow', requireAuth, ah(async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) throw new HttpError(404, 'Company not found');
  const key = { userId_companyId: { userId: req.user!.id, companyId: company.id } };
  if (await prisma.follow.findUnique({ where: key })) {
    await prisma.follow.delete({ where: key });
    return res.json({ following: false });
  }
  await prisma.follow.create({ data: { userId: req.user!.id, companyId: company.id } });
  await bumpInterest(req.user!.id, company.industry, INTEREST_DELTAS.FOLLOW);
  res.json({ following: true });
}));

/** Only that company's admins (or platform admins) manage its devices and channels. */
function assertCompanyAccess(user: Express.Request['user'], companyId: string) {
  if (!user) throw new HttpError(401, 'Please log in');
  if (user.role === 'ADMIN') return;
  if (user.role === 'COMPANY_ADMIN' && user.companyId === companyId) return;
  throw new HttpError(403, 'Not allowed');
}

const deviceSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['CCTV', 'SMART_TV', 'RADIO', 'IOT_SENSOR', 'MOBILE', 'API']),
  location: z.string().max(120).optional(),
  consentRef: z.string().min(3).max(120), // signed data-sharing agreement number
});

companiesRouter.post('/:id/devices', requireAuth, ah(async (req, res) => {
  assertCompanyAccess(req.user, req.params.id);
  const body = deviceSchema.parse(req.body);
  const k = newDeviceKey();
  const device = await prisma.device.create({
    data: { ...body, companyId: req.params.id, keyPrefix: k.prefix, apiKeyHash: k.hash },
    select: { id: true, name: true, type: true, location: true, keyPrefix: true, createdAt: true },
  });
  // The full key is shown ONCE. Put it in the edge agent's config.
  res.status(201).json({ device, apiKey: k.key });
}));

companiesRouter.get('/:id/devices', requireAuth, ah(async (req, res) => {
  assertCompanyAccess(req.user, req.params.id);
  const devices = await prisma.device.findMany({
    where: { companyId: req.params.id },
    select: { id: true, name: true, type: true, location: true, keyPrefix: true, active: true, lastSeenAt: true },
  });
  res.json({ items: devices });
}));

const channelSchema = z.object({
  platform: z.enum(['WEBHOOK', 'TELEGRAM', 'FACEBOOK_PAGE', 'X']),
  name: z.string().min(1).max(80),
  config: z.record(z.string(), z.string().max(2000)),
});

companiesRouter.post('/:id/channels', requireAuth, ah(async (req, res) => {
  assertCompanyAccess(req.user, req.params.id);
  const body = channelSchema.parse(req.body);
  const ch = await prisma.channel.create({
    data: { companyId: req.params.id, platform: body.platform, name: body.name, config: body.config as Prisma.InputJsonValue },
    select: { id: true, platform: true, name: true, active: true },
  });
  res.status(201).json(ch);
}));

companiesRouter.get('/:id/analytics', requireAuth, ah(async (req, res) => {
  assertCompanyAccess(req.user, req.params.id);
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const totals = await prisma.post.aggregate({
    where: { companyId: req.params.id, status: 'PUBLISHED', publishedAt: { gte: since } },
    _count: true,
    _sum: { viewCount: true, likeCount: true, shareCount: true, saveCount: true },
  });
  const failedJobs = await prisma.publishJob.count({
    where: { status: 'FAILED', post: { companyId: req.params.id }, createdAt: { gte: since } },
  });
  res.json({ last30Days: { posts: totals._count, ...totals._sum, failedDeliveries: failedJobs } });
}));
