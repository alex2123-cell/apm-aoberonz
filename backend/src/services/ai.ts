import { config } from '../config';
import { logger } from '../lib/logger';
import { classifyRisk } from './riskGate';
import type { Risk } from '@prisma/client';

export interface EventInput {
  kind: string;
  labels: string[];
  transcript?: string | null;
  text?: string | null;
  reading?: unknown;
  companyName: string;
  industry: string;
  location?: string | null;
  deviceType: string;
}

export interface Draft {
  headline: string;
  summary: string;
  tags: string[];
  risk: Risk;
  language: string;
}

const KIND_PHRASES: Record<string, string> = {
  vehicle_convoy: 'a convoy of vehicles is on the move',
  truck_departure: 'loaded trucks are leaving the site',
  machine_running: 'new machinery is now running',
  crowd: 'a large crowd has gathered',
  fire: 'smoke or fire has been detected',
  motion: 'new activity has been detected',
  speech: 'a new announcement was broadcast',
  sensor_threshold: 'a sensor reading has crossed its normal range',
  production_milestone: 'a production milestone has been reached',
};

/** Offline writer: always works, no API key needed. */
export function ruleBasedDraft(e: EventInput): Draft {
  const where = e.location ? ` at ${e.location}` : '';
  const phrase = KIND_PHRASES[e.kind] ?? `${e.kind.replace(/_/g, ' ')} detected`;
  const headline = `${e.companyName}: ${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}${where}`.slice(0, 120);
  const detailParts: string[] = [];
  if (e.labels.length) detailParts.push(`Detected: ${e.labels.slice(0, 5).join(', ')}.`);
  if (e.transcript) detailParts.push(`Broadcast excerpt: "${e.transcript.slice(0, 200)}"`);
  if (e.text) detailParts.push(e.text.slice(0, 300));
  if (e.reading) detailParts.push(`Reading: ${JSON.stringify(e.reading).slice(0, 120)}.`);
  const summary =
    `${e.companyName} (${e.industry}) update${where}: ${phrase}. ` +
    detailParts.join(' ') +
    ` Source: ${e.deviceType.toLowerCase().replace('_', ' ')} feed, processed automatically by Aoberonz.`;
  const tags = [e.industry, e.kind, ...e.labels].map((t) => t.toLowerCase().replace(/\s+/g, '')).slice(0, 6);
  return {
    headline,
    summary,
    tags: [...new Set(tags)],
    risk: classifyRisk(`${headline} ${summary}`, e.kind),
    language: 'en',
  };
}

/** LLM writer (Anthropic Messages API). Falls back to the rule-based writer on any problem. */
export async function writeDraft(e: EventInput): Promise<Draft> {
  const base = ruleBasedDraft(e);
  if (!config.anthropicApiKey) return base;
  try {
    const prompt = `You write short, factual industry news updates for a live feed in Kenya.
Only use the facts given. Never guess names of people. Never identify individuals.
Return JSON only: {"headline": string (max 100 chars), "summary": string (50-120 words), "tags": string[] (max 5), "language": "en"}.

Facts:
company: ${e.companyName}
industry: ${e.industry}
location: ${e.location ?? 'unknown'}
source device: ${e.deviceType}
event type: ${e.kind}
detected labels: ${e.labels.join(', ') || 'none'}
transcript: ${e.transcript ?? 'none'}
text: ${e.text ?? 'none'}
reading: ${e.reading ? JSON.stringify(e.reading) : 'none'}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.aiModel,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`AI API ${res.status}`);
    const body = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = body.content.find((c) => c.type === 'text')?.text ?? '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const headline = String(json.headline ?? base.headline).slice(0, 120);
    const summary = String(json.summary ?? base.summary);
    return {
      headline,
      summary,
      tags: Array.isArray(json.tags) ? json.tags.map(String).slice(0, 5) : base.tags,
      // risk is ALWAYS decided by our own rules, never by the model
      risk: maxRisk(base.risk, classifyRisk(`${headline} ${summary}`, e.kind)),
      language: String(json.language ?? 'en'),
    };
  } catch (err) {
    logger.warn({ err }, 'AI writer failed, using rule-based draft');
    return base;
  }
}

function maxRisk(a: Risk, b: Risk): Risk {
  const order: Risk[] = ['LOW', 'MEDIUM', 'HIGH'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}
