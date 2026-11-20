import type { Risk } from '@prisma/client';

/** Words that always send an update to a human before it goes out. */
const HIGH_RISK = [
  'fire', 'explosion', 'accident', 'injury', 'injured', 'death', 'dead', 'fatal', 'spill', 'leak',
  'collapse', 'strike', 'protest', 'layoff', 'layoffs', 'retrenchment', 'fraud', 'loss', 'losses',
  'profit warning', 'arrest', 'police', 'evacuation', 'outage', 'moto', 'ajali',
];
const MEDIUM_RISK = ['price', 'tariff', 'shares', 'merger', 'acquisition', 'tender', 'contract', 'delay'];

export function classifyRisk(text: string, eventKind?: string): Risk {
  const t = ` ${text.toLowerCase()} `;
  if (eventKind && ['fire', 'smoke', 'crowd', 'accident', 'spill'].includes(eventKind)) return 'HIGH';
  if (HIGH_RISK.some((w) => t.includes(` ${w}`))) return 'HIGH';
  if (MEDIUM_RISK.some((w) => t.includes(` ${w}`))) return 'MEDIUM';
  return 'LOW';
}

export interface GateInput {
  risk: Risk;
  confidence: number;
  companyAutoPublish: boolean;
  minConfidence: number;
}

/** true = publish now, false = wait for a human approver. */
export function canAutoPublish(g: GateInput): boolean {
  if (!g.companyAutoPublish) return false;
  if (g.risk === 'HIGH') return false;
  if (g.risk === 'MEDIUM' && g.confidence < Math.min(0.95, g.minConfidence + 0.1)) return false;
  return g.confidence >= g.minConfidence;
}
