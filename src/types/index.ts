// src/types/index.ts

export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type Square = string // e.g. 'e4'

export interface Piece {
  type: PieceType
  color: Color
}

export interface Move {
  from: Square
  to: Square
  piece: PieceType
  captured?: PieceType
  promotion?: PieceType
  san: string
  flags: string
  color: Color
}

export interface MoveAnnotation {
  type: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
  symbol: '!!' | '!' | '?!' | '?' | '??'
  explanation?: string
  bestMove?: string
  evalBefore?: number
  evalAfter?: number
}

export interface AnnotatedMove extends Move {
  annotation?: MoveAnnotation
  evalScore?: number
}

// Game
export type GameMode = 'ai' | 'multiplayer' | 'analysis' | 'puzzle'
export type GameStatus = 'waiting' | 'active' | 'completed' | 'abandoned'
export type GameResult = 'white' | 'black' | 'draw' | null
export type TimeControl = '1+0' | '3+0' | '5+0' | '10+0' | '15+10' | '30+0'
export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface GameConfig {
  mode: GameMode
  timeControl: TimeControl
  difficulty?: Difficulty
  color?: Color | 'random'
}

export interface Player {
  id: string
  username: string
  elo: number
  avatar_url?: string
  city?: string
  country?: string
  is_online?: boolean
}

export interface Game {
  id: string
  white_player_id: string
  black_player_id?: string
  pgn: string
  fen: string
  status: GameStatus
  result?: GameResult
  time_control: TimeControl
  created_at: string
  completed_at?: string
  white_time_remaining: number
  black_time_remaining: number
  white_player?: Player
  black_player?: Player
  move_count: number
}

export interface GameMove {
  id: string
  game_id: string
  move_number: number
  san: string
  fen_after: string
  eval_score?: number
  time_spent?: number
  created_at: string
}

// Leaderboard
export interface LeaderboardEntry {
  rank: number
  player: Player
  elo: number
  games_played: number
  wins: number
  losses: number
  draws: number
  win_rate: number
  elo_change_month: number
}

// AI Analysis
export interface PositionAnalysis {
  fen: string
  bestMove: string
  evaluation: number
  depth: number
  pv: string[] // principal variation
  annotation?: MoveAnnotation
}

export interface GameAnalysis {
  game_id: string
  moves: AnnotatedMove[]
  accuracy: {
    white: number
    black: number
  }
  phases: {
    opening?: string
    middlegame?: string
    endgame?: string
  }
  critical_moments: number[]
}

// Puzzle
export interface Puzzle {
  id: string
  fen: string
  moves: string[]
  rating: number
  themes: string[]
  popularity: number
}

// Realtime events
export interface RealtimeGameEvent {
  type: 'move' | 'resign' | 'draw_offer' | 'draw_accept' | 'timeout' | 'player_joined'
  game_id: string
  payload: Record<string, unknown>
  timestamp: string
}

// Database types (for Supabase)
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          elo: number
          elo_blitz: number
          elo_rapid: number
          elo_classical: number
          avatar_url: string | null
          city: string | null
          country: string | null
          games_played: number
          wins: number
          losses: number
          draws: number
          created_at: string
          updated_at: string
          is_premium: boolean
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      games: {
        Row: Game
        Insert: Omit<Game, 'created_at'>
        Update: Partial<Game>
      }
      game_moves: {
        Row: GameMove
        Insert: Omit<GameMove, 'id' | 'created_at'>
        Update: Partial<GameMove>
      }
    }
  }
}
