/**
 * The "For You" ranking.
 *
 * Every candidate post gets a score from five signals:
 *   freshness  - news loses value fast (half-life a few hours)
 *   engagement - likes, saves and shares from everyone (log-scaled so one viral post doesn't take over)
 *   affinity   - how much THIS user cares about the industry, plus a bonus for companies they follow
 *   quality    - AI confidence and verified companies
 *   exploration- a small random boost so users discover new industries
 * Then a diversity pass stops the feed showing the same industry or company back to back.
 * Pure functions only: easy to unit test and to tune.
 */

export interface Candidate {
  id: string;
  companyId: string;
  industry: string;
  publishedAt: Date;
  likeCount: number;
  saveCount: number;
  shareCount: number;
  viewCount: number;
  confidence: number;
  verified: boolean;
}

export interface UserSignals {
  interests: Record<string, number>; // industry -> weight (0..10)
  followedCompanyIds: Set<string>;
}

export interface RankWeights {
  freshness: number;
  engagement: number;
  affinity: number;
  quality: number;
  exploration: number;
  halfLifeHours: number;
}

export const DEFAULT_WEIGHTS: RankWeights = {
  freshness: 1.0,
  engagement: 0.6,
  affinity: 1.2,
  quality: 0.3,
  exploration: 0.25,
  halfLifeHours: 6,
};

export function freshnessScore(publishedAt: Date, now: Date, halfLifeHours: number): number {
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000);
  return Math.pow(0.5, ageHours / halfLifeHours);
}

export function engagementScore(c: Candidate): number {
  const raw = c.likeCount * 3 + c.saveCount * 4 + c.shareCount * 5 + c.viewCount * 0.1;
  // log scale, ~1.0 at 1,000 weighted actions
  return Math.log1p(raw) / Math.log1p(1000);
}

export function affinityScore(c: Candidate, user: UserSignals | null): number {
  if (!user) return 0;
  const weights = Object.values(user.interests);
  const max = weights.length ? Math.max(...weights, 1) : 1;
  const industry = (user.interests[c.industry] ?? 0) / max;
  const follow = user.followedCompanyIds.has(c.companyId) ? 0.8 : 0;
  return industry + follow;
}

export function scoreCandidate(
  c: Candidate,
  user: UserSignals | null,
  now: Date,
  w: RankWeights = DEFAULT_WEIGHTS,
  random: () => number = Math.random,
): number {
  const quality = c.confidence * 0.7 + (c.verified ? 0.3 : 0);
  // explore more where the user has shown little interest
  const known = user ? (user.interests[c.industry] ?? 0) : 0;
  const explore = known < 0.5 ? random() : random() * 0.2;
  return (
    w.freshness * freshnessScore(c.publishedAt, now, w.halfLifeHours) +
    w.engagement * engagementScore(c) +
    w.affinity * affinityScore(c, user) +
    w.quality * quality +
    w.exploration * explore
  );
}

/**
 * Greedy re-rank: walk the sorted list and avoid placing a post whose industry
 * or company matches the previous `window` posts, if a different one is available nearby.
 */
export function diversify<T extends { industry: string; companyId: string }>(sorted: T[], window = 2, lookahead = 8): T[] {
  const pool = [...sorted];
  const out: T[] = [];
  while (pool.length) {
    const recent = out.slice(-window);
    let pick = 0;
    for (let i = 0; i < Math.min(lookahead, pool.length); i++) {
      const p = pool[i];
      const clash = recent.some((r) => r.industry === p.industry || r.companyId === p.companyId);
      if (!clash) {
        pick = i;
        break;
      }
    }
    out.push(pool.splice(pick, 1)[0]);
  }
  return out;
}

export function rankFeed(
  candidates: Candidate[],
  user: UserSignals | null,
  opts: { now?: Date; limit?: number; weights?: RankWeights; random?: () => number } = {},
): Candidate[] {
  const now = opts.now ?? new Date();
  const scored = candidates
    .map((c) => ({ c, s: scoreCandidate(c, user, now, opts.weights, opts.random) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
  return diversify(scored).slice(0, opts.limit ?? 10);
}

/** How each action changes a user's interest in an industry. */
export const INTEREST_DELTAS = {
  LIKE: 0.5,
  SAVE: 0.8,
  SHARE: 1.0,
  FOLLOW: 1.0,
  LONG_VIEW: 0.2, // read for 5+ seconds
  SKIP: -0.1, // swiped away in under 1.5 seconds
} as const;

export function nextInterestWeight(current: number, delta: number): number {
  return Math.min(10, Math.max(0, current + delta));
}
