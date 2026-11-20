import { describe, expect, it } from 'vitest';
import { rankFeed, diversify, freshnessScore, nextInterestWeight, type Candidate } from '../src/services/ranking';
import { canAutoPublish, classifyRisk } from '../src/services/riskGate';
import { ruleBasedDraft } from '../src/services/ai';
import { formatForPlatform } from '../src/services/publisher';

const now = new Date('2026-11-18T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const c = (id: string, industry: string, companyId: string, h: number, likes = 0): Candidate => ({
  id, industry, companyId, publishedAt: hoursAgo(h), likeCount: likes, saveCount: 0, shareCount: 0, viewCount: 0,
  confidence: 0.9, verified: true,
});
const noRandom = () => 0;

describe('ranking', () => {
  it('halves freshness every half-life', () => {
    expect(freshnessScore(hoursAgo(6), now, 6)).toBeCloseTo(0.5, 5);
    expect(freshnessScore(hoursAgo(0), now, 6)).toBe(1);
  });

  it('puts a fresh post above an old one when all else is equal', () => {
    const out = rankFeed([c('old', 'energy', 'a', 48), c('new', 'mining', 'b', 1)], null, { now, random: noRandom });
    expect(out[0].id).toBe('new');
  });

  it('favours industries the user cares about', () => {
    const user = { interests: { mining: 8, energy: 0.5 }, followedCompanyIds: new Set<string>() };
    const out = rankFeed([c('e', 'energy', 'a', 2), c('m', 'mining', 'b', 3)], user, { now, random: noRandom });
    expect(out[0].id).toBe('m');
  });

  it('boosts followed companies', () => {
    const user = { interests: {}, followedCompanyIds: new Set(['b']) };
    const out = rankFeed([c('x', 'energy', 'a', 1), c('y', 'energy', 'b', 2)], user, { now, random: noRandom });
    expect(out[0].id).toBe('y');
  });

  it('avoids the same industry back to back when it can', () => {
    const sorted = [c('1', 'energy', 'a', 1), c('2', 'energy', 'b', 1), c('3', 'mining', 'c', 1), c('4', 'finance', 'd', 1)];
    const out = diversify(sorted, 1);
    for (let i = 1; i < out.length; i++) {
      if (out[i].industry === out[i - 1].industry) {
        // only allowed if nothing else was left
        expect(out.slice(i).every((p) => p.industry === out[i].industry)).toBe(true);
      }
    }
  });

  it('keeps interest weights between 0 and 10', () => {
    expect(nextInterestWeight(9.8, 1)).toBe(10);
    expect(nextInterestWeight(0.05, -0.1)).toBe(0);
  });
});

describe('risk gate', () => {
  it('flags safety and finance words as high risk', () => {
    expect(classifyRisk('Fire reported at the warehouse')).toBe('HIGH');
    expect(classifyRisk('Bank announces layoffs')).toBe('HIGH');
    expect(classifyRisk('New packing line opens')).toBe('LOW');
    expect(classifyRisk('anything', 'smoke')).toBe('HIGH');
  });

  it('never auto-publishes high risk, and respects confidence', () => {
    const g = { companyAutoPublish: true, minConfidence: 0.75 };
    expect(canAutoPublish({ ...g, risk: 'HIGH', confidence: 0.99 })).toBe(false);
    expect(canAutoPublish({ ...g, risk: 'LOW', confidence: 0.7 })).toBe(false);
    expect(canAutoPublish({ ...g, risk: 'LOW', confidence: 0.8 })).toBe(true);
    expect(canAutoPublish({ ...g, risk: 'MEDIUM', confidence: 0.8 })).toBe(false);
    expect(canAutoPublish({ ...g, risk: 'MEDIUM', confidence: 0.9 })).toBe(true);
    expect(canAutoPublish({ ...g, companyAutoPublish: false, risk: 'LOW', confidence: 1 })).toBe(false);
  });
});

describe('writers and formatting', () => {
  it('writes a usable draft with no API key', () => {
    const d = ruleBasedDraft({
      kind: 'vehicle_convoy', labels: ['truck', 'truck'], companyName: 'Coast Bulk', industry: 'logistics',
      location: 'Mombasa', deviceType: 'CCTV',
    });
    expect(d.headline).toContain('Coast Bulk');
    expect(d.risk).toBe('LOW');
    expect(new Set(d.tags).size).toBe(d.tags.length);
  });

  it('fits X posts into 280 characters', () => {
    const post = {
      id: 'p1', headline: 'H'.repeat(100), summary: 'S'.repeat(600), tags: ['logistics', 'mombasa'], aiGenerated: true,
      company: { name: 'Coast Bulk' },
    } as unknown as Parameters<typeof formatForPlatform>[0];
    expect(formatForPlatform(post, 280).length).toBeLessThanOrEqual(280);
  });
});
