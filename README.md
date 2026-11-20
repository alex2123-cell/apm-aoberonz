# Aoberonz

Live industry news from the devices companies already own — CCTV, smart TVs, radio, IoT sensors and company systems — turned into short verified updates and served in a swipe-to-scroll **For You** feed on web, Android and iOS, then pushed out to social media and partner newsrooms.

```
aoberonz/
├── backend/          Node.js + TypeScript API and worker (Express, Prisma/PostgreSQL, Redis/BullMQ, Socket.io)
│   └── public/       ★ THE WEB FRONTEND (HTML/CSS/JS) — served by the backend at http://localhost:4000
├── app/              Flutter app for the Android and iOS stores (GetX)
├── .devcontainer/    GitHub Codespaces: installs and starts everything automatically
├── edge-agent/   Python agent that runs at each site next to the cameras/radios/sensors
├── infra/        Hosting config (Fly.io for API + worker, Firebase Hosting for web)
├── docs/         Release, distribution and operations runbooks
└── .github/      CI, deploy and store-release workflows
```

## How it works

1. **Edge agent** at a company site watches a camera, radio stream or sensor and sends a small event (labels + confidence, faces blurred) to `POST /api/ingest/events` with the device's key.
2. **Worker** turns the event into a headline and summary (Claude API if `ANTHROPIC_API_KEY` is set, otherwise a built-in writer), then the **risk gate** decides: low risk + high confidence publishes at once; accidents, finance, safety and low-confidence drafts wait for a human in the review queue.
3. Published posts appear live in the app (websocket "N new updates" pill) and are queued to each company channel (webhook, Telegram, Facebook Page, X) with retries.
4. The **For You** feed ranks posts per user by freshness, engagement, industry interest, followed companies and a little exploration, and never repeats what you've already seen. Every swipe teaches it: long reads raise an industry's weight, quick skips lower it.

## Fastest way to see it: GitHub Codespaces

1. On GitHub: **Code → Codespaces → Create codespace on main**. Setup runs by itself (about 3–5 minutes).
2. In the terminal: `cd backend && npm run dev`
3. Open the **Ports** tab → port **4000** → click the globe icon. That's the full app in your browser.

Already have a codespace? Run `bash .devcontainer/setup.sh` once, then step 2.

## Where is the frontend?

There are two frontends that use the same backend:

| Frontend | Folder | How to see it |
| --- | --- | --- |
| **Web app** (browser, phone browser, installable) | `backend/public/` | Run the backend, open http://localhost:4000 |
| **Mobile app** (Play Store, App Store) | `app/` | Needs Flutter: `flutter run` (see below) |

Don't open these folders with Live Server — it only lists files. The backend serves the web app.

## Run it on your machine (Windows, macOS or Linux)

You need: [Git](https://git-scm.com), [Node.js 22](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Flutter](https://docs.flutter.dev/get-started/install) and Python 3.11+ (for the edge agent). Editor: Visual Studio Code with the Flutter, Dart and Prisma extensions (or Visual Studio for the backend).

```bash
# 1. Databases
docker compose up -d postgres redis mosquitto

# 2. Backend
cd backend
cp .env.example .env            # Windows PowerShell: copy .env.example .env
npm install
npx prisma migrate dev --name init   # creates the tables and the first migration
npm run db:seed                 # demo companies, posts, logins; prints a demo device key
npm run dev                     # API on http://localhost:4000
# in a second terminal
npm run worker:dev              # background worker

# 3. App (new terminal)
cd app
bash tool/setup_platforms.sh    # once: creates android/ ios/ web/ folders (Git Bash on Windows)
flutter run -d chrome --dart-define=API_URL=http://localhost:4000
# Android emulator: --dart-define=API_URL=http://10.0.2.2:4000

# 4. Edge agent (optional, new terminal)
cd edge-agent
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
set AOBERONZ_DEVICE_KEY=aob_...                 # macOS/Linux: export AOBERONZ_DEVICE_KEY=aob_...
python agent.py camera --source 0               # your webcam
```

Demo logins (password `ChangeMe123!`): `admin@aoberonz.local`, `editor@aoberonz.local`, `company@aoberonz.local`. Change them before going live.

## Check that everything works

```bash
cd backend
npm test                                         # ranking, risk gate, formatting
DEVICE_KEY=aob_... npx tsx scripts/smoke.ts      # 25 end-to-end checks against the running API + worker
```

## Main API endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | anyone | get a token |
| GET | `/api/feed?tab=foryou\|following\|latest&industry=&exclude=` | anyone | the feed |
| POST | `/api/posts/:id/like`, `/save`, `/share` | user | reactions (toggle) |
| POST | `/api/posts/interactions/batch` | user | dwell times, trains For You |
| POST | `/api/companies/:id/follow` | user | follow / unfollow |
| POST | `/api/companies/:id/devices` | company admin | register a device, returns its key once |
| POST | `/api/companies/:id/channels` | company admin | add a distribution channel |
| GET | `/api/companies/:id/analytics` | company admin | 30-day reach |
| POST | `/api/ingest/events` | device key | send an event |
| GET | `/api/review/queue`, POST `/api/review/:id/approve`, `/reject` | editor, company admin | the human risk gate |
| DELETE | `/api/me` | user | delete account and data |
| GET | `/health/live`, `/health/ready`, `/metrics` | monitors | uptime and Prometheus metrics |

## Publish

- **Push to GitHub**, then CI runs tests, the smoke test and a Flutter web build on every push.
- **Deploy** (`.github/workflows/deploy.yml`): API + worker to Fly.io, web to Firebase Hosting, after CI passes on `main`.
- **Store releases** (`.github/workflows/release-mobile.yml`): tag `v1.0.0` → signed Android bundle to Google Play internal testing, iOS build to TestFlight. Step by step: [docs/MOBILE_RELEASE.md](docs/MOBILE_RELEASE.md).
- Running it day to day: [docs/OPERATIONS.md](docs/OPERATIONS.md). Turning on social channels: [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

Proprietary. © Aoberonz. All rights reserved.
