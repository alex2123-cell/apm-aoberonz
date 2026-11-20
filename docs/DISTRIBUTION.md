# Turning on distribution channels

Each company adds its own channels through `POST /api/companies/:id/channels`. Tokens are stored in `Channel.config`; in production encrypt that column (see OPERATIONS.md, "Secrets").

| Platform | `platform` | `config` keys | What you need first |
| --- | --- | --- | --- |
| Any website, newsroom CMS, Zapier, Make | `WEBHOOK` | `url`, optional `secret` (sent as `x-aoberonz-secret`) | Nothing — easiest way to start |
| Telegram channel | `TELEGRAM` | `botToken`, `chatId` (e.g. `@aoberonz_energy`) | Create a bot with @BotFather and make it an admin of the channel |
| Facebook Page | `FACEBOOK_PAGE` | `pageId`, `pageAccessToken` | A Meta developer app with page publishing permission, approved through Meta's App Review |
| X (Twitter) | `X` | `userAccessToken` | An X developer app with write access and an OAuth 2.0 user token with `tweet.write`. Check X's current API pricing tier before relying on it |

Example:

```bash
curl -X POST https://api.aoberonz.com/api/companies/<companyId>/channels \
  -H "authorization: Bearer <company admin token>" -H "content-type: application/json" \
  -d '{"platform":"TELEGRAM","name":"Energy channel","config":{"botToken":"123:ABC","chatId":"@aoberonz_energy"}}'
```

Failed sends retry 5 times with exponential backoff, then show as `FAILED` in `PublishJob` and in the company's analytics (`failedDeliveries`).

**Adding LinkedIn, Instagram, YouTube or WhatsApp Channels:** add an entry to `adapters` in `backend/src/services/publisher.ts` and a value to the `Platform` enum in `schema.prisma`. Each needs its own approved developer app; plan two to six weeks for approvals.
