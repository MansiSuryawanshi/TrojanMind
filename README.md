# TrojanMind

**Learn together. Reason deeper.**

> NotebookLM helps you study — TrojanMind makes sure you actually understand.

TrojanMind is a USC-branded active-learning platform for verified `@usc.edu` students. It turns course materials into timed challenges, Socratic follow-ups, readiness scores, and adaptive study plans — and keeps Piazza + Brightspace close while you work.

---

## What it does

Students often get the right answer without understanding *why*. TrojanMind closes that gap:

1. Import or upload study material  
2. Take a Reasoning Challenge (solo vs Claude or live multiplayer)  
3. Detect weak topics from real mistakes  
4. Defend answers in Cross-Examination  
5. Track readiness, get an adaptive schedule, and revisit Piazza updates without leaving the app  

Core loop:

```
Material → Quiz → Detect gaps → Socratic defense → Readiness → Study plan
```

---

## Features

| Area | What you get |
|---|---|
| **My Courses / My Materials** | Browse Brightspace by semester, import supported files/pages into durable workspaces, or upload PDF / `.txt` / paste |
| **Summary** | Detailed / quick / exam-revision summaries, flashcards, grounded Q&A on your document |
| **Reasoning Challenge** | Timed quizzes (5–50 Q), solo vs Claude, live rooms via code/invite |
| **Cross-Examination** | Socratic follow-up on a past mistake → Gap closed / Partial / Study more |
| **Exam Prep** | Readiness score, weak areas, topic coverage, exam countdown |
| **Study Schedule** | Deadline-aware plan focused on your weakest topics |
| **Study Report** | Attempt history, accuracy trends, optional AI insights |
| **Piazza Assistant** | Floating right-side panel: New Notification, Discussions, Ask AI (grounded in Piazza + open workspace) |

---

## Architecture

```
┌──────────────────────────────┐
│  React + Vite (TrojanMind UI)│
│  Zustand · Firebase Auth     │
│  Firestore (users/{uid}/…)   │
└──────────────┬───────────────┘
               │  /local-api/*  (Vite proxy)
               ▼
┌──────────────────────────────┐
│  Local server :8787          │
│  Firebase ID-token gate      │
│  Claude proxy                │
│  Brightspace MCP (stdio)     │
│  Piazza MCP (browser SSO)    │
└──────────────────────────────┘
```

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind 4, Framer Motion, Zustand  
- **Auth / data:** Firebase Auth + Firestore (per-user paths)  
- **AI:** Anthropic Claude via authenticated local proxy (`ANTHROPIC_API_KEY` stays server-side)  
- **Connectors:** `brightspace-mcp-server` + `piazza-mcp` (localhost / owner-UID only)

### Firebase shape (high level)

Most data lives under `users/{uid}/…`:

- `documents`, `quizAttempts`, `crossExams`, `summaries`, `flashcardDecks`, `mistakes`, `revisionTasks`, `workspaces` (+ chunked `texts`)
- Piazza: `piazzaAssistantPreferences`, `piazzaCourseMappings`, `piazzaNotifications`, `piazzaSyncState`, `piazzaPostCache`

Shared multiplayer rooms use top-level `sessions/{sessionId}`.

---

## App map

No router — `App.tsx` switches tabs:

| Tab | Screen |
|---|---|
| 0 | Home (Hero, Features, How it works) |
| 1 | Upload Material |
| 2 | Summary |
| 3 | Reasoning Challenge |
| 4 | Exam Prep |
| 5 | Study Schedule |
| 6 | Study Report |
| 7 | My Courses (Brightspace) |
| 8 | My Materials (workspaces) |

`PiazzaAssistant` floats on every authenticated screen (cream/cardinal pill, golden orbit, notification badge).

---

## Brightspace import

1. Sign in → My Courses → connect (owner UID on local server)  
2. Open a course → select modules/topics  
3. Import streams into a Firestore workspace (NDJSON)  
4. Open My Materials → start Summary / Challenge / Exam Prep  

**Imported:** Brightspace-hosted files and HTML pages  
**Reference-only:** Google Drive, Docs/Sheets/Slides, recordings, LTI, external sites  
**Limits:** ≤25 items/import · connector 10 MB text cap · combined study doc ~280k chars  

> Files over 10 MB: download from Brightspace, then use **Upload or paste instead**.

---

## Piazza Assistant

- **New Notification** — app-side change detection (baseline on first sync; not official Piazza push)  
- **Discussions** — recent feed + search; expand answers; open allowlisted `piazza.com` URLs  
- **Ask AI** — searches recent + keyword discussions, prefers instructor answers, max ~3 sentences and 1–2 source chips; optionally soft-grounds with your open My Materials study excerpt  

Course selector can **Follow current course** when you open a Brightspace workspace.

---

## Setup

```bash
cd TrojanMind
npm install
```

**Frontend** — `.env` with Firebase `VITE_FIREBASE_*` keys (see existing project `.env`).

**Local server** — copy `server/.env.example` → `server/.env.local` and set at least:

```env
FIREBASE_PROJECT_ID=...
LOCAL_BRIGHTSPACE_OWNER_UID=...
LOCAL_BRIGHTSPACE_EXPECTED_UNIQUE_NAME=...
LOCAL_PIAZZA_OWNER_UID=...
ANTHROPIC_API_KEY=...
```

Run both client + server:

```bash
npm run dev
```

Or separately:

```bash
npm run dev:client   # Vite
npm run server       # 127.0.0.1:8787
```

Build / typecheck:

```bash
npm run build
npm run typecheck:server
```

---

## Security notes (local connectors)

- Server binds to `127.0.0.1` only  
- Firebase ID token + verified email required  
- Brightspace / Piazza routes are owner-UID gated  
- Claude key never ships to the browser  
- Piazza post links are allowlisted to `https://piazza.com/class/...`  

Brightspace + Piazza are **local-dev / demo** connectors — not multi-tenant cloud OAuth yet.

---

## Demo path

1. Sign up / verify with `@usc.edu`  
2. Upload notes **or** import from My Courses  
3. Run a Reasoning Challenge  
4. Open Exam Prep → Cross-Examination on a weak topic  
5. Generate a Study Schedule  
6. Open the Piazza pill → Sync → Ask AI about TAs / deadlines  

---

## Key files

| Path | Role |
|---|---|
| `src/App.tsx` | Tab shell + Piazza mount |
| `src/store/store.ts` | Zustand (session, readiness, course context) |
| `src/components/ReasoningChallenge.tsx` | Quiz + multiplayer |
| `src/components/CrossExamination.tsx` | Socratic defense |
| `src/components/Summary.tsx` | Summaries / flashcards / doc Q&A |
| `src/components/PiazzaAssistant.tsx` | Floating Piazza UI |
| `src/services/piazzaAsk.ts` | Grounded Ask AI |
| `src/services/piazzaSync.ts` | Notification change detection |
| `server/index.ts` | Local API + auth boundary |
| `server/brightspaceMcp.ts` | Brightspace MCP adapter |
| `server/piazzaMcp.ts` | Piazza client adapter |
| `server/aiProxy.ts` | Claude proxy |

---

## Vision

> Learning isn’t about getting the right answer — it’s about understanding *why* it’s right.
