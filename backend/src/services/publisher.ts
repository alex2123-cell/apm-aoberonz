import type { Channel, Post, Company } from '@prisma/client';

/**
 * Distribution adapters. Each returns the external id of what it posted.
 * Tokens live in Channel.config. Every platform needs its own developer app approval:
 * see docs/DISTRIBUTION.md before turning one on.
 */
export type PostWithCompany = Post & { company: Company };

export interface Adapter {
  send(post: PostWithCompany, config: Record<string, string>): Promise<string | undefined>;
}

const publicUrl = (post: Post) => `${process.env.PUBLIC_WEB_URL ?? 'https://aoberonz.com'}/p/${post.id}`;

export function formatForPlatform(post: PostWithCompany, maxLen: number): string {
  const tags = post.tags.slice(0, 3).map((t) => `#${t.replace(/[^\w]/g, '')}`).join(' ');
  const tail = `\n\n${publicUrl(post)}${tags ? `\n${tags}` : ''}${post.aiGenerated ? '\n(AI-assisted update)' : ''}`;
  const room = maxLen - tail.length;
  let body = `${post.headline}\n\n${post.summary}`;
  if (body.length > room) body = `${body.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return body + tail;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export const adapters: Record<Channel['platform'], Adapter> = {
  // Any partner newsroom / website / Zapier endpoint
  WEBHOOK: {
    async send(post, cfg) {
      await postJson(cfg.url, {
        id: post.id,
        headline: post.headline,
        summary: post.summary,
        industry: post.industry,
        company: post.company.name,
        url: publicUrl(post),
        mediaUrl: post.mediaUrl,
        publishedAt: post.publishedAt,
        aiGenerated: post.aiGenerated,
      }, cfg.secret ? { 'x-aoberonz-secret': cfg.secret } : {});
      return undefined;
    },
  },
  // Telegram channel via a bot that is an admin of the channel. config: { botToken, chatId }
  TELEGRAM: {
    async send(post, cfg) {
      const r = await postJson(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
        chat_id: cfg.chatId,
        text: formatForPlatform(post, 4000),
        disable_web_page_preview: false,
      });
      return r?.result?.message_id ? String(r.result.message_id) : undefined;
    },
  },
  // Facebook Page post. config: { pageId, pageAccessToken }
  FACEBOOK_PAGE: {
    async send(post, cfg) {
      const r = await postJson(`https://graph.facebook.com/${cfg.pageId}/feed`, {
        message: formatForPlatform(post, 5000),
        link: publicUrl(post),
        access_token: cfg.pageAccessToken,
      });
      return r?.id;
    },
  },
  // X (Twitter) API v2 with an OAuth 2.0 user access token that has tweet.write. config: { userAccessToken }
  X: {
    async send(post, cfg) {
      const r = await postJson(
        'https://api.x.com/2/tweets',
        { text: formatForPlatform(post, 280) },
        { authorization: `Bearer ${cfg.userAccessToken}` },
      );
      return r?.data?.id;
    },
  },
};
