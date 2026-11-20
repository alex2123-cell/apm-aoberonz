# Running Aoberonz in production

## 1. The uptime target, honestly

| Target | Downtime allowed per month | Downtime per year | What it takes |
| --- | --- | --- | --- |
| 99.5% | about 3.6 hours | about 1.8 days | One region, managed database, daily backups |
| 99.9% | about 43 minutes | about 8.8 hours | 2+ API machines, health checks, rolling deploys, managed DB with automatic failover, alerts to a phone |
| **99.99%** | **about 4.3 minutes** | **about 53 minutes** | Everything above **plus** two regions, a database with a cross-region standby, a staffed 24/7 on-call rota, practised failover, and changes that never need downtime |

Nobody can promise 99.99% on day one. Launch with a **99.9% service-level objective (SLO)** measured on `GET /health/ready`, run it for a quarter, then move to 99.99% once the second region and on-call rota are in place. Only put 99.99% into customer contracts (an SLA) once you have three months of data proving it.

Also note: your uptime can never be higher than the services you depend on. Check the published SLA of your database host, Redis host, Fly.io and Firebase Hosting before you write a number in a contract.

## 2. Production layout

```
Users (web, Android, iOS)
   │
   ├── Firebase Hosting (web app, global CDN)
   └── api.aoberonz.com ── Fly.io, 2+ machines in jnb + 2 in a second region (e.g. ams or fra)
                               │  health check /health/ready every 10 s, unhealthy machines get no traffic
                               ├── Managed PostgreSQL (primary + standby with automatic failover, point-in-time recovery)
                               ├── Managed Redis (queues + websocket fan-out)
                               └── Worker machines (AI + distribution), scale by queue length
Edge agents at company sites ──► api.aoberonz.com/api/ingest (buffer on disk if the link drops)
```

Why it survives failures:
- **A machine dies** → health check fails → traffic goes to the others. `min_machines_running = 2`.
- **A deploy is bad** → rolling deploy stops at the first machine that fails health checks; roll back with `fly releases` + `fly deploy --image <previous>`.
- **The database primary fails** → the managed provider promotes the standby (seconds to a minute).
- **Redis is down** → ingestion still saves events in Postgres; the worker catches up when Redis returns. The feed keeps working.
- **A social platform is down** → its jobs retry with backoff; nothing else is affected.
- **A site loses internet** → the edge agent buffers events to disk and replays them in order.

## 3. Monitoring and alerts (set up before launch)

| What | Tool (any equivalent works) | Alert when |
| --- | --- | --- |
| Uptime from outside | UptimeRobot, Better Stack or Checkly hitting `/health/ready` from 3+ locations every 30–60 s | 2 failures in a row → page on-call |
| Errors | Sentry (Node SDK in backend, `sentry_flutter` in the app) | New error type, or error rate > 1% |
| Metrics | Grafana Cloud scraping `/metrics` (set `METRICS_TOKEN`) | p95 latency > 1 s for 5 min; queue backlog > 500 jobs |
| Logs | Fly.io logs shipped to Grafana Loki / Better Stack | Search during incidents |
| Business health | Daily query: posts published, failed deliveries, devices silent > 1 hour | Morning report to the team |

Status page: publish one (status.aoberonz.com) from the uptime tool so customers see incidents without emailing you.

## 4. Supervision: who does what

| Role | Responsibility | Cadence |
| --- | --- | --- |
| **On-call engineer** (rotating weekly) | Answers alerts within 15 min (24/7 for 99.99%), follows the runbook, writes the incident note | Always |
| **Duty editor** | Clears the review queue; target: high-risk drafts decided within 15 minutes in working hours, 1 hour otherwise | Daily shifts |
| **Tech lead** | Approves pull requests touching auth, risk gate, privacy; owns releases | Every PR |
| **Data protection officer** | Device consent records, deletion requests, ODPC renewals, breach notification | Monthly review |
| **Founder / CEO** | Weekly reliability and growth review, customer escalations | Weekly |

### Weekly operations review (30 minutes)
1. Uptime vs SLO, and how much of the month's error budget is left (99.9% = 43 min).
2. Incidents and their follow-up actions.
3. Review queue: average time to decision, number of reports, rejected drafts (what fooled the AI?).
4. Failed deliveries per platform.
5. Silent devices and edge-agent versions in the field.
6. Feed health: average session length, swipes per session, share rate, day-7 retention.

**Error budget rule:** if the month's budget is used up, stop shipping features and spend the rest of the month on reliability.

## 5. Change process (how code reaches users)

1. Work on a branch → open a pull request → CI must pass → one approval (two for auth, risk gate, privacy).
2. Merge to `main` → Deploy workflow → `production` environment approval → rolling deploy → automatic post-deploy health check.
3. Database changes are **expand then contract**: add new columns/tables first, deploy code that uses them, remove old ones in a later release. Never rename or drop in the same release that stops using it.
4. Mobile: tag `vX.Y.Z` → internal testing → closed testing → staged rollout (10% → 50% → 100%) while watching Sentry crash rate.
5. Turn on GitHub branch protection for `main`: require the CI checks and a review; block force-push.

## 6. Incident runbook

1. **Acknowledge** the page; post in the incident channel: what is broken, since when.
2. **Check** `fly status -a aoberonz-api`, `fly logs -a aoberonz-api`, `/health/ready` output (it says whether the DB or Redis is down), the database provider's status page.
3. **Mitigate first, fix later:** roll back the last deploy, scale up (`fly scale count 4`), or switch a company to manual approval (`autoPublish=false`) if bad posts are going out.
4. **Bad post published:** reject it in the review queue (it disappears from feeds immediately); delete it from each social channel by its `externalId` in `PublishJob`; publish a correction.
5. **Personal data exposed:** contain it, then notify the Data Commissioner within **72 hours** as the Data Protection Act requires, and affected users without undue delay.
6. **Write it up** within 48 hours: timeline, cause, what will stop it happening again. No blame.

## 7. Backups and recovery

- Managed Postgres with point-in-time recovery (at least 7 days). Plus a nightly logical dump to separate storage: `pg_dump --format=custom "$DATABASE_URL" > aoberonz-$(date +%F).dump`.
- **Test a restore every month** into a scratch database. A backup you haven't restored is a hope, not a backup.
- Targets: lose at most 5 minutes of data (RPO), be back within 30 minutes (RTO).

## 8. Secrets

- Never commit `.env`, keystores or tokens (the `.gitignore` already blocks them). Use `fly secrets set` and GitHub Actions secrets.
- Rotate `JWT_SECRET` and platform tokens at least yearly and whenever someone leaves.
- Encrypt `Channel.config` at rest before onboarding paying customers (e.g. AES-GCM with a key from `fly secrets`), or move tokens to a secrets manager.
- Device keys are stored only as SHA-256 hashes; a lost key is replaced by registering the device again.
- Turn on 2-factor authentication for every GitHub, Fly.io, Firebase, Apple and Google account.
