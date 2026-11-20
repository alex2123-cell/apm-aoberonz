/**
 * End-to-end smoke test against a running API + worker (after `npm run db:seed`).
 *   API_URL=http://localhost:4000 DEVICE_KEY=aob_... npx tsx scripts/smoke.ts
 * Exits non-zero on the first failure. Run it after every deploy.
 */
import http from 'node:http';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:4000';
const DEVICE_KEY = process.env.DEVICE_KEY ?? '';
let failures = 0;

function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra ? `  ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  if (!ok) failures++;
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { text }; }
  return { status: res.status, json };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ready = await call('GET', '/health/ready');
  check('health/ready is 200', ready.status === 200, ready.json);

  const anon = await call('GET', '/api/feed?tab=foryou&limit=10');
  check('anonymous For You feed returns posts', anon.status === 200 && anon.json.items.length > 0, anon.json);

  const email = `smoke+${Date.now()}@example.com`;
  const reg = await call('POST', '/api/auth/register', { email, password: 'Password123!', name: 'Smoke', interests: ['mining'] });
  check('register', reg.status === 201 && !!reg.json.token, reg.json);
  const auth = { authorization: `Bearer ${reg.json.token}` };

  const fy = await call('GET', '/api/feed?tab=foryou&limit=10', undefined, auth);
  check('personal For You feed', fy.status === 200 && fy.json.items.length > 0, fy.json);
  const miningShare = fy.json.items.filter((p: any) => p.industry === 'mining').length;
  check('chosen interest (mining) appears in first page', miningShare >= 1, fy.json.items.map((p: any) => p.industry));

  const first = fy.json.items[0];
  const like = await call('POST', `/api/posts/${first.id}/like`, undefined, auth);
  check('like toggles on', like.json.liked === true, like.json);
  const save = await call('POST', `/api/posts/${first.id}/save`, undefined, auth);
  check('save toggles on', save.json.saved === true, save.json);
  const saved = await call('GET', '/api/me/saved', undefined, auth);
  check('saved list contains post', saved.json.items?.some((p: any) => p.id === first.id), saved.json);

  const views = await call('POST', '/api/posts/interactions/batch', {
    events: fy.json.items.slice(0, 3).map((p: any, i: number) => ({ postId: p.id, dwellMs: i === 0 ? 8000 : 800 })),
  }, auth);
  check('view tracking', views.json.recorded === 3, views.json);

  const next = await call('GET', '/api/feed?tab=foryou&limit=10', undefined, auth);
  const seen = new Set(fy.json.items.slice(0, 3).map((p: any) => p.id));
  check('seen posts are not repeated', !next.json.items.some((p: any) => seen.has(p.id)), next.json.items.map((p: any) => p.id));

  const latest = await call('GET', '/api/feed?tab=latest&limit=5');
  const dates = latest.json.items.map((p: any) => p.publishedAt);
  check('latest tab is newest first', dates.every((d: string, i: number) => i === 0 || d <= dates[i - 1]), dates);

  const company = await call('GET', '/api/companies/coast-bulk-terminals', undefined, auth);
  const follow = await call('POST', `/api/companies/${company.json.id}/follow`, undefined, auth);
  check('follow company', follow.json.following === true, follow.json);
  const following = await call('GET', '/api/feed?tab=following&limit=10', undefined, auth);
  check('following tab shows only followed company', following.json.items.length > 0 &&
    following.json.items.every((p: any) => p.companyId === company.json.id), following.json);

  if (!DEVICE_KEY) {
    console.log('SKIP  ingest tests (set DEVICE_KEY from the seed output)');
  } else {
    // Webhook listener to prove distribution works
    let webhookHits = 0;
    const hook = http.createServer((req, res) => { webhookHits++; req.resume(); res.end('ok'); }).listen(4999);

    const admin = await call('POST', '/api/auth/login', { email: 'company@aoberonz.local', password: 'ChangeMe123!' });
    const cAuth = { authorization: `Bearer ${admin.json.token}` };
    const ch = await call('POST', `/api/companies/${admin.json.user.companyId}/channels`,
      { platform: 'WEBHOOK', name: 'Local test hook', config: { url: 'http://localhost:4999/hook' } }, cAuth);
    check('company admin adds webhook channel', ch.status === 201, ch.json);

    const sock = io(API, { transports: ['websocket'] });
    const live: any[] = [];
    sock.on('post:new', (p) => live.push(p));
    await new Promise<void>((r) => sock.on('connect', () => r()));

    const low = await call('POST', '/api/ingest/events',
      { kind: 'vehicle_convoy', labels: ['truck', 'trailer'], confidence: 0.92 }, { 'x-device-key': DEVICE_KEY });
    check('device event accepted', low.status === 202, low.json);
    const high = await call('POST', '/api/ingest/events',
      { kind: 'fire', labels: ['smoke'], confidence: 0.97 }, { 'x-device-key': DEVICE_KEY });
    const bad = await call('POST', '/api/ingest/events', { kind: 'motion', confidence: 0.9 }, { 'x-device-key': 'aob_wrong' });
    check('wrong device key rejected', bad.status === 401, bad.json);

    await wait(4000);
    check('low-risk event auto-published live over websocket', live.length >= 1, live);
    check('webhook channel received the post', webhookHits >= 1, { webhookHits });

    const editor = await call('POST', '/api/auth/login', { email: 'editor@aoberonz.local', password: 'ChangeMe123!' });
    const eAuth = { authorization: `Bearer ${editor.json.token}` };
    const queue = await call('GET', '/api/review/queue', undefined, eAuth);
    const draft = queue.json.items?.find((p: any) => p.eventId === high.json.eventId);
    check('high-risk event waits in review queue', !!draft && draft.risk === 'HIGH', queue.json);
    const userTry = await call('GET', '/api/review/queue', undefined, auth);
    check('normal users cannot see review queue', userTry.status === 403, userTry.json);
    if (draft) {
      const ok = await call('POST', `/api/review/${draft.id}/approve`, { headline: 'Smoke seen at site, crews responding safely' }, eAuth);
      check('editor approves with edit', ok.json.status === 'PUBLISHED', ok.json);
      const audit = await call('GET', `/api/review/${draft.id}/audit`, undefined, eAuth);
      check('audit trail records draft, edit and approval',
        ['draft_created', 'edited', 'approved'].every((a) => audit.json.items.some((x: any) => x.action === a)), audit.json);
    }
    sock.close();
    hook.close();
  }

  // Three different users report the same post -> it leaves the feed
  const target = (await call('GET', '/api/feed?tab=latest&limit=1')).json.items[0];
  const reporters: Record<string, string>[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await call('POST', '/api/auth/register', { email: `rep${i}+${Date.now()}@example.com`, password: 'Password123!', name: `R${i}` });
    reporters.push({ authorization: `Bearer ${r.json.token}` });
  }
  let last: any = {};
  for (const h of reporters) last = await call('POST', `/api/posts/${target.id}/report`, { reason: 'Looks wrong' }, h);
  check('three reports hide a post for review', last.json.hidden === true, last.json);
  const gone = await call('GET', `/api/posts/${target.id}`);
  check('hidden post is no longer public', gone.status === 404, gone.json);
  for (const h of reporters) await call('DELETE', '/api/me', undefined, h);

  const del = await call('DELETE', '/api/me', undefined, auth);
  check('user can delete own account', del.status === 204, del.json);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
