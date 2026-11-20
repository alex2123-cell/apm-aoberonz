import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/http';
import { optionalAuth } from '../lib/auth';
import { getFeed } from '../services/feed';

export const feedRouter = Router();

const feedQuery = z.object({
  tab: z.enum(['foryou', 'following', 'latest']).default('foryou'),
  industry: z.string().max(40).optional(),
  county: z.string().max(40).optional(),
  cursor: z.string().max(40).optional(),
  exclude: z.string().max(4000).optional(), // comma separated ids already shown
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

/** GET /api/feed?tab=foryou&exclude=id1,id2 — works logged in or out. */
feedRouter.get(
  '/',
  optionalAuth,
  ah(async (req, res) => {
    const q = feedQuery.parse(req.query);
    const result = await getFeed({
      tab: q.tab,
      userId: req.user?.id,
      industry: q.industry,
      county: q.county,
      cursor: q.cursor === 'more' ? undefined : q.cursor,
      exclude: q.exclude ? q.exclude.split(',').filter(Boolean).slice(0, 200) : [],
      limit: q.limit,
    });
    res.set('Cache-Control', req.user ? 'private, no-store' : 'public, max-age=15');
    res.json(result);
  }),
);
