# ♞ KnightOwl Chess

> A full-stack chess application with Stockfish AI, real-time position evaluation, AI coaching, OAuth authentication, and a global leaderboard — built with Next.js, Zustand, and Supabase.

**Live demo:** [knightowl-chess-vs-ai.vercel.app](https://knightowl-chess-vs-ai.vercel.app)

---

## Table of Contents

- [What is KnightOwl?](#what-is-knightowl)
- [Feature Overview](#feature-overview)
- [How It Works — Architecture Deep Dive](#how-it-works--architecture-deep-dive)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Supabase Database Schema](#supabase-database-schema)
- [Stockfish Integration](#stockfish-integration)
- [Authentication Flow](#authentication-flow)
- [Theme System](#theme-system)
- [Deployment](#deployment)

---

## What is KnightOwl?

KnightOwl is a lightweight but fully-featured chess app that runs entirely in the browser. You play against **Stockfish** — one of the strongest chess engines ever built — with a difficulty slider that scales from ~600 Elo (complete beginner) up to master-level play. Every game is analysed in real time, and an **AI Coach** panel explains the thinking behind key moves in plain language.

If you sign in with Google or GitHub, your results are saved to a Supabase database and appear on a live **global leaderboard**. If you'd rather play anonymously, the full game still works — nothing is locked behind auth.

### Who is it for?

| Audience | Why KnightOwl helps |
|---|---|
| **Beginners** | Adjustable difficulty + AI coaching that explains moves in plain English |
| **Casual players** | No account required, runs in the browser, multiple time controls |
| **Developers** | Clean reference implementation of Stockfish WASM + Supabase + Next.js App Router |

---

## Feature Overview

### Gameplay
- **vs AI mode** — play against Stockfish at 5 difficulty levels (Novice → Master)
- **Analysis mode** — move both sides freely to explore positions; no timer, no opponent
- **6 time controls** — Bullet (1+0), Blitz (3+0, 5+0), Rapid (10+0, 15+10), Classical (30+0)
- **Legal move enforcement** — powered by `chess.js`; illegal moves are rejected silently
- **Promotion support** — pawn promotion handled automatically
- **Check / Checkmate / Stalemate / Draw detection** — full status tracking with animated banners

### Board & UI
- **Interactive drag-and-drop board** — built from scratch with click-to-select fallback
- **6 board colour themes** — Classic, Ocean, Forest, Purple, Midnight, Pikmi
- **Real-time evaluation bar** — vertical bar shows Stockfish's positional assessment (±centipawns)
- **Move highlights** — last move and legal move squares are visually highlighted
- **Responsive layout** — board size auto-calculates to fit any screen; fully usable on mobile
- **Dark / light mode** — system-preference aware, persisted to `localStorage`

### AI Coach
- Analyses the current position after every move
- Explains the engine's top choice in plain language
- Identifies tactical motifs (forks, pins, discovered attacks, etc.)
- Powered by Stockfish depth analysis + Claude AI interpretation

### Auth & Data
- **OAuth via Supabase** — Google and GitHub sign-in, no passwords
- **Auto-profile creation** — a database profile is created on first sign-in via a Postgres trigger
- **Game saving** — result, colour, difficulty, move count, duration, and PGN saved after each game
- **Leaderboard** — a Supabase `VIEW` aggregates wins/losses/draws per player, ordered by wins

---

## How It Works — Architecture Deep Dive

### Game State — `useGameStore` (Zustand)

The entire game state lives in a single Zustand store (`src/store/gameStore.ts`). This is the source of truth for everything:

```
gameStore
├── chess          — chess.js Chess instance (move validation, FEN, PGN)
├── status         — 'idle' | 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'
├── playerColor    — 'w' | 'b'
├── mode           — 'ai' | 'analysis'
├── whiteTime      — seconds remaining for white
├── blackTime      — seconds remaining for black
├── activeTimer    — which clock is ticking
├── initGame()     — sets up a new game from a GameConfig object
├── makeMove()     — validates + applies a move, updates status, switches timer
├── startTimer()   — begins the countdown loop
└── resetGame()    — clears everything back to idle
```

After a game ends (checkmate/draw/timeout), the store automatically calls a Supabase insert to save the result — but only if a user is signed in.

### AI Moves — `useStockfish` Hook

Stockfish runs as a **Web Worker** loading `stockfish.js` from `/public/stockfish/`. The hook (`src/hooks/useStockfish.ts`) communicates with it via UCI protocol messages:

1. `uci` — initialise
2. `setoption name Skill Level value N` — maps difficulty 1–5 to Stockfish skill 0–20
3. `position fen <FEN>` — tell Stockfish the current position
4. `go depth N` — request analysis to a fixed depth
5. Parse `bestmove <from><to>` from the response

The AI move loop in `page.tsx` watches the FEN string via a `useEffect`. When it detects it's the AI's turn and the game is active, it fires `playAIMove()` after a 300ms delay (so the UI doesn't feel instant/robotic).

**Fallback:** if Stockfish WASM fails to load, the hook falls back to picking a random legal move so the game remains playable.

### Position Evaluation — `analyzePosition`

After every player move, `analyzePosition()` is called with the current FEN. Stockfish returns centipawn scores and the top line. This feeds two things:
- The **EvalBar** component — a vertical bar that shifts toward white/black based on the score
- The **AICoach** component — which formats the engine output into a human-readable coaching tip

### Chess Board — `ChessBoard` Component

The board is rendered as an 8×8 grid of `<div>` elements, not a `<canvas>`. Each square is sized dynamically via the `useBoardSize` hook in `page.tsx`, which calculates the optimal pixel size based on `window.innerWidth` and `window.innerHeight` with three responsive breakpoints:

- **Mobile (<640px):** fills width, capped at 55% of viewport height
- **Tablet (<1024px):** capped at 520px
- **Desktop:** min of (viewport height − 160px, 55vw, 600px)

Chess pieces are rendered by the `Piece` component, which maps piece codes (e.g. `wK`, `bP`) to SVG or image assets. Move highlighting is handled by the `MoveHighlight` overlay component which draws coloured squares on top of the board.

### Timer System

Each player has an integer seconds counter in the store. When `startTimer()` is called, a `setInterval` fires every second, decrementing the active player's clock. On `makeMove()`, the active timer switches. If a clock hits zero, the game ends immediately with the opponent winning.

The `TimerDisplay` component colour-codes each clock: normal → accent gold, ≤30 seconds → danger red with a glow effect.

### Auth — `useAuth` Hook

`useAuth` (`src/hooks/useAuth.ts`) wraps Supabase's `onAuthStateChange` listener. It exposes:
- `user` — the current Supabase user object (or `null`)
- `loading` — boolean, true until the initial session is resolved
- `signOut()` — calls `supabase.auth.signOut()`

The `AuthModal` component triggers `supabase.auth.signInWithOAuth()` with either `google` or `github` as the provider. After OAuth redirect, Supabase handles the session and the `onAuthStateChange` listener picks it up automatically.

A **Postgres trigger** (`handle_new_user`) fires on every new row in `auth.users` and creates a matching row in the `profiles` table, pulling the username from the OAuth metadata (GitHub username, Google display name, or email prefix as fallback).

### Leaderboard

The `Leaderboard` component fetches from a Supabase `VIEW` called `leaderboard`. The view joins `profiles` and `games`, aggregates results per player, and orders by wins descending. Because it's a view with `security_invoker = true`, Supabase's Row Level Security policies on the underlying tables still apply.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Chess Logic | `chess.js` |
| AI Engine | Stockfish 16 (WASM via Web Worker) |
| State Management | Zustand |
| Auth + Database | Supabase (PostgreSQL + OAuth) |
| Styling | Tailwind CSS + CSS custom properties |
| Fonts | Cinzel, Cormorant Garamond, DM Mono (Google Fonts) |
| Deployment | Vercel |

---

## Project Structure

```
second_chess/
├── public/
│   └── stockfish/
│       ├── stockfish.js        # Stockfish Web Worker script
│       └── stockfish.wasm      # Stockfish WASM binary
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout — ThemeProvider, Toaster
│   │   ├── page.tsx            # Main page — game setup, board, side panel
│   │   └── globals.css         # CSS variables, utility classes, animations
│   ├── components/
│   │   ├── AuthModal.tsx       # OAuth sign-in modal (Google + GitHub)
│   │   ├── Leaderboard.tsx     # Leaderboard table from Supabase view
│   │   ├── ThemeProvider.tsx   # Context + hook + ThemeToggle button
│   │   └── game/
│   │       ├── ChessBoard.tsx  # 8×8 interactive board grid
│   │       ├── AICoach.tsx     # Real-time coaching panel
│   │       ├── Piece.tsx       # Chess piece renderer
│   │       ├── EvalBar.tsx     # Evaluation bar (±centipawns)
│   │       └── MoveHighlight.tsx # Move + legal square highlights
│   ├── hooks/
│   │   ├── useAuth.ts          # Supabase session listener + signOut
│   │   └── useStockfish.ts     # Stockfish UCI wrapper + difficulty mapping
│   ├── store/
│   │   └── gameStore.ts        # Zustand store — full game state + DB saves
│   ├── lib/supabase/
│   │   └── supabase.ts         # Supabase client (singleton)
│   └── types/
│       └── index.ts            # GameConfig, Piece, Square, etc.
├── .env.local                  # Your secrets (never commit this)
├── .env.local.example          # Template for env vars
├── tailwind.config.js
├── next.config.js
└── tsconfig.json
```

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- Google and/or GitHub OAuth app credentials

### 1. Clone and install

```bash
git clone https://github.com/your-username/second_chess.git
cd second_chess
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these in Supabase → Project Settings → API.

### 3. Set up the database

Run the following SQL in Supabase → SQL Editor:

```sql
-- User profiles (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  avatar_url text,
  created_at timestamp default now()
);

-- Game results
create table games (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references profiles(id) on delete cascade,
  result text check (result in ('win', 'loss', 'draw')),
  player_color text check (player_color in ('w', 'b')),
  difficulty int,
  moves int,
  duration int,   -- seconds
  pgn text,
  created_at timestamp default now()
);

-- Leaderboard aggregation view
create view leaderboard as
select
  p.username,
  count(*) filter (where g.result = 'win')  as wins,
  count(*) filter (where g.result = 'loss') as losses,
  count(*) filter (where g.result = 'draw') as draws,
  count(*)                                   as total_games
from profiles p
left join games g on g.player_id = p.id
group by p.username
order by wins desc;

alter view public.leaderboard set (security_invoker = true);

-- Row Level Security
alter table profiles enable row level security;
alter table games    enable row level security;

create policy "Anyone can view profiles"   on profiles for select using (true);
create policy "Users update own profile"   on profiles for update using (auth.uid() = id);
create policy "Users insert own profile"   on profiles for insert with check (auth.uid() = id);

create policy "Anyone can view games"      on games for select using (true);
create policy "Users insert own games"     on games for insert with check (auth.uid() = player_id);

-- Auto-create profile on first sign-in
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'user_name',  -- GitHub username
      new.raw_user_meta_data->>'name',        -- Google display name
      split_part(new.email, '@', 1),          -- Email prefix fallback
      'Player'
    )
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 4. Configure OAuth providers

In **Supabase → Authentication → Providers**:

**Google:**
1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the OAuth consent screen
3. Create credentials → OAuth 2.0 Client ID (Web application)
4. Add `https://your-project.supabase.co/auth/v1/callback` as an authorised redirect URI
5. Paste Client ID and Secret into Supabase

**GitHub:**
1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Set callback URL to `https://your-project.supabase.co/auth/v1/callback`
3. Paste Client ID and Secret into Supabase

In **Supabase → Authentication → URL Configuration**, add your redirect URLs:
```
http://localhost:3000/**
https://your-app.vercel.app/**
```

### 5. Add Stockfish

Download Stockfish WASM and place the files in `public/stockfish/`:

```bash
mkdir -p public/stockfish
# Download from https://github.com/nicvagn/stockfish-js/releases
# Place stockfish.js and stockfish.wasm in public/stockfish/
```

> **Without Stockfish files:** the game still works — the `useStockfish` hook falls back to random legal moves automatically.

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Supabase Database Schema

```
auth.users (managed by Supabase)
    │
    └── profiles
            id          uuid PK → auth.users.id
            username    text UNIQUE
            avatar_url  text
            created_at  timestamp
            │
            └── games
                    id            uuid PK
                    player_id     uuid FK → profiles.id
                    result        'win' | 'loss' | 'draw'
                    player_color  'w' | 'b'
                    difficulty    int (1–5)
                    moves         int
                    duration      int (seconds)
                    pgn           text
                    created_at    timestamp

leaderboard (VIEW)
    username, wins, losses, draws, total_games
    ordered by wins DESC
```

---

## Stockfish Integration

Stockfish runs in a **Web Worker** to avoid blocking the main thread. The `useStockfish` hook manages the full lifecycle:

### Difficulty mapping

| UI Level | Label | Stockfish Skill | Approximate Elo |
|---|---|---|---|
| 1 | Novice | 0 | ~600 |
| 2 | Casual | 5 | ~1000 |
| 3 | Club | 10 | ~1500 |
| 4 | Expert | 15 | ~2000 |
| 5 | Master | 20 | ~2800 |

### UCI communication flow

```
useStockfish hook
    │
    ├── new Worker('/stockfish/stockfish.js')
    ├── postMessage('uci')                              → waits for 'uciok'
    ├── postMessage('setoption name Skill Level value N')
    │
    ├── analyzePosition(fen)
    │       postMessage('position fen <FEN>')
    │       postMessage('go depth 15')
    │       ← parse 'info depth ... score cp <N> pv <moves>'
    │       → calls onAnalysis({ score, bestLine })
    │
    └── playAIMove(fen, callback)
            postMessage('position fen <FEN>')
            postMessage('go movetime 1000')
            ← parse 'bestmove <from><to> [ponder <move>]'
            → calls callback(from, to, promotion?)
```

---

## Authentication Flow

```
User clicks "Sign in"
    │
    └── AuthModal opens
            │
            ├── "Continue with Google"  → supabase.auth.signInWithOAuth({ provider: 'google' })
            └── "Continue with GitHub"  → supabase.auth.signInWithOAuth({ provider: 'github' })
                    │
                    └── Redirect to OAuth provider → user authenticates
                            │
                            └── Redirect back to app with session token
                                    │
                                    ├── Supabase session established
                                    ├── auth.users row created (if new user)
                                    ├── Postgres trigger fires → profiles row created
                                    └── useAuth hook picks up session via onAuthStateChange
                                            │
                                            └── UI updates: shows username + "Leave" button
```

After a game ends (checkmate or draw), if the user is signed in, `gameStore` automatically inserts a row into `games`. If not signed in, a prompt appears inviting them to sign in to save their result.

---

## Theme System

KnightOwl uses a **CSS custom properties** approach to theming — no Tailwind dark mode variants needed.

### How it works

1. `:root` defines the dark palette (default)
2. `html.light` overrides every variable with the light palette
3. `ThemeProvider` adds/removes the `light` class on `<html>` and persists the choice to `localStorage`
4. On first load, it checks `localStorage` → falls back to `prefers-color-scheme`

### Toggling

```tsx
import { ThemeToggle } from '@/components/ThemeProvider'

// Drop anywhere in your JSX:
<ThemeToggle />   // renders ☀️ / 🌙 button
```

### Palette reference

| Variable | Dark | Light | Usage |
|---|---|---|---|
| `--background` | `#080a0e` | `#f5f0e8` | Page background |
| `--surface` | `#0e1117` | `#ede8de` | Cards, panels |
| `--surface2` | `#141920` | `#e4ddd0` | Nested surfaces |
| `--text` | `#d4cfc8` | `#1a1610` | Primary text |
| `--text2` | `#a09890` | `#4a4030` | Secondary text |
| `--muted` | `#5a6070` | `#8a8070` | Labels, hints |
| `--accent` | `#c8a96e` | `#9a7030` | Gold highlights |
| `--accent2` | `#e8c97e` | `#b88c3a` | Hover gold |
| `--danger` | `#c0503a` | `#b03020` | Clock warnings |
| `--success` | `#4a9060` | `#2a7040` | Positive states |

---

## Deployment

### Vercel (recommended)

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Add New Project → import the repo
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**

Remember to add your Vercel deployment URL to Supabase's allowed redirect URLs.

---

## Scripts

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

---

## License

MIT — use it, fork it, learn from it.
