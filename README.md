# ♞ KnightOwl Chess

A chess app with AI coaching powered by Stockfish.

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

Then edit `.env.local` with your real values from https://supabase.com/dashboard

> **Note:** If you don't want multiplayer, you can use dummy values:
> ```
> NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
> NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder_key
> ```
> The game will still work for AI and analysis modes.

### 3. Add Stockfish (for AI moves)
Download Stockfish WASM and place it in `public/stockfish/`:
- Go to https://github.com/nicvagn/stockfish-js/releases
- Download `stockfish.js` and `stockfish.wasm`
- Place both files in `public/stockfish/`

> **Without Stockfish:** The game still works — AI will make random moves as a fallback.

### 4. Run the app
```bash
npm run dev
```

Open http://localhost:3000

## Project Structure

```
src/
├── app/
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Main game page
│   └── globals.css       # Global styles + CSS variables
├── components/game/
│   ├── ChessBoard.tsx    # Interactive chess board
│   ├── AICoach.tsx       # AI coaching panel
│   ├── Piece.tsx         # Chess piece renderer
│   ├── EvalBar.tsx       # Evaluation bar
│   └── MoveHighlight.tsx # Move highlight overlay
├── hooks/
│   ├── useStockfish.ts   # Stockfish WASM hook
│   └── useMultiplayer.ts # Supabase realtime multiplayer
├── store/
│   └── gameStore.ts      # Zustand game state
├── lib/supabase/
│   └── client.ts         # Supabase client helpers
└── types/
    └── index.ts          # TypeScript types
```

## Missing Files (that were generated but needed)
All of these are now included:
- ✅ `next.config.js` - with COOP/COEP headers for Stockfish WASM
- ✅ `tsconfig.json` - with `@/*` path aliases
- ✅ `tailwind.config.js`
- ✅ `postcss.config.js`
- ✅ `src/app/layout.tsx`
- ✅ `src/app/page.tsx`
- ✅ `src/app/globals.css`
- ✅ `src/components/game/Piece.tsx`
- ✅ `src/components/game/EvalBar.tsx`
- ✅ `src/components/game/MoveHighlight.tsx`
