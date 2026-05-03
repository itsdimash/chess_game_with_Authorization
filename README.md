# ♞ KnightOwl Chess

A chess app with AI coaching powered by Stockfish and Supabase authentication + leaderboard.

---

## What is this?

KnightOwl Chess is a full-stack web chess application where you can play against an AI powered by Stockfish — one of the strongest chess engines in the world. It includes real-time position evaluation, an AI coaching panel that explains moves, a global leaderboard, and Google/GitHub authentication so your game history is saved automatically.

## Who is it for?

- **Beginners** who want to learn chess with AI coaching and adjustable difficulty (level 1 starts at ~600 Elo)
- **Casual players** who want a clean, fast chess experience without installing anything
- **Developers** who want to see how to integrate Stockfish WASM, Supabase auth, and real-time game saving into a Next.js app

## Why is it valuable?

Most chess apps are either too complex (full platforms like Chess.com) or too simple (no auth, no history). KnightOwl hits the middle ground — it's a lightweight, open-source app that gives you a real chess experience with persistent stats, without the bloat. The AI coaching feature makes it genuinely useful for improving your game, not just playing it.

---

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
Copy the example env file and fill in your Supabase credentials:
```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Get these from your Supabase dashboard → Settings → API.

### 3. Set up Supabase database
Run this SQL in Supabase → SQL Editor:

```sql
-- Players profile (extends Supabase auth)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  avatar_url text,
  created_at timestamp default now()
);

-- Game history
create table games (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references profiles(id) on delete cascade,
  result text check (result in ('win', 'loss', 'draw')),
  player_color text check (player_color in ('w', 'b')),
  difficulty int,
  moves int,
  duration int,
  pgn text,
  created_at timestamp default now()
);

-- Leaderboard view
create view leaderboard as
select
  p.username,
  count(*) filter (where g.result = 'win') as wins,
  count(*) filter (where g.result = 'loss') as losses,
  count(*) filter (where g.result = 'draw') as draws,
  count(*) as total_games
from profiles p
left join games g on g.player_id = p.id
group by p.username
order by wins desc;

-- Fix leaderboard security
alter view public.leaderboard set (security_invoker = true);

-- Row level security
alter table profiles enable row level security;
alter table games enable row level security;

create policy "Users can view all profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "Users can view all games" on games for select using (true);
create policy "Users can insert own games" on games for insert with check (auth.uid() = player_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
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

### 4. Enable OAuth providers
In Supabase → Authentication → Providers, enable:
- **Google** — add your Client ID and Secret
- **GitHub** — add your Client ID and Secret

Add your app URL to Supabase → Authentication → URL Configuration → Redirect URLs:
- Local: `http://localhost:3000/**`
- Production: `https://your-app.vercel.app/**`

### 5. Add Stockfish (for AI moves)
Download Stockfish and place it in `public/stockfish/`:
- Go to https://github.com/nicvagn/stockfish-js/releases
- Download `stockfish.js` and `stockfish.wasm`
- Place both files in `public/stockfish/`

> **Without Stockfish:** The game still works — AI will make random moves as a fallback.

### 6. Run the app
```bash
npm run dev
```

Open http://localhost:3000

---

## Deployment (Vercel)

1. Push to GitHub
2. Go to vercel.com → Add New Project → import your repo
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click Deploy

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with ThemeProvider
│   ├── page.tsx                # Main game page
│   └── globals.css             # Global styles + CSS variables
├── components/
│   ├── AuthModal.tsx           # Google + GitHub sign in modal
│   ├── Leaderboard.tsx         # Leaderboard fetched from Supabase view
│   ├── ThemeProvider.tsx       # Dark/light theme toggle
│   └── game/
│       ├── ChessBoard.tsx      # Interactive chess board with drag + drop
│       ├── AICoach.tsx         # AI coaching panel
│       ├── Piece.tsx           # Chess piece renderer
│       ├── EvalBar.tsx         # Evaluation bar
│       └── MoveHighlight.tsx   # Move highlight overlay
├── hooks/
│   ├── useAuth.ts              # Supabase auth hook (Google, GitHub, signOut)
│   └── useStockfish.ts         # Stockfish WASM hook with difficulty levels
├── store/
│   └── gameStore.ts            # Zustand game state + Supabase game saving
├── lib/supabase/
│   └── supabase.ts             # Supabase client
└── types/
    └── index.ts                # TypeScript types
```

## Features

- ♟ Play vs AI (Stockfish) with 5 difficulty levels
- 🔍 Analysis mode — move both sides freely
- ⏱ Multiple time controls (1+0 to 30+0)
- 🎨 5 board themes
- 🔐 Google + GitHub authentication via Supabase
- 💾 Game results auto-saved to Supabase after each game
- 🏆 Leaderboard with wins, losses, draws
- 🌙 Dark/light mode
- 📱 Responsive — works on mobile and desktop
