// src/store/gameStore.ts
import { create } from 'zustand'
import { Chess, Square, Move } from 'chess.js'
import type { Color, GameConfig, GameMode, Difficulty, AnnotatedMove } from '@/types'

interface GameState {
  // Core chess state
  chess: Chess
  selectedSquare: Square | null
  legalMoves: Square[]
  lastMove: { from: Square; to: Square } | null
  moveHistory: AnnotatedMove[]

  // Game meta
  gameId: string | null
  playerColor: Color | 'both'
  mode: GameMode
  difficulty: Difficulty
  status: 'idle' | 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'

  // Clocks
  whiteTime: number
  blackTime: number
  activeTimer: 'w' | 'b' | null
  timerInterval: NodeJS.Timeout | null

  // Analysis
  evalScore: number
  isAnalyzing: boolean
  coachMessage: string

  // AI
  isAIThinking: boolean

  // Multiplayer
  opponentOnline: boolean

  // Actions
  initGame: (config: GameConfig) => void
  selectSquare: (square: Square) => void
  clearSelection: () => void
  makeMove: (from: Square, to: Square, promotion?: string) => boolean
  setEvalScore: (score: number) => void
  setCoachMessage: (msg: string) => void
  setAIThinking: (thinking: boolean) => void
  setOpponentOnline: (online: boolean) => void
  resetGame: () => void
  loadPGN: (pgn: string) => void
  startTimer: () => void
  stopTimer: () => void
  tick: () => void
}

const TIME_CONTROLS: Record<string, number> = {
  '1+0': 60,
  '3+0': 180,
  '5+0': 300,
  '10+0': 600,
  '15+10': 900,
  '30+0': 1800,
}

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  moveHistory: [],

  gameId: null,
  playerColor: 'w',
  mode: 'ai',
  difficulty: 1,
  status: 'idle',

  whiteTime: 600,
  blackTime: 600,
  activeTimer: null,
  timerInterval: null,

  evalScore: 0,
  isAnalyzing: false,
  coachMessage: 'Welcome! Start a game and I\'ll analyze your moves.',

  isAIThinking: false,
  opponentOnline: false,

  initGame: (config) => {
    const state = get()
    if (state.timerInterval) clearInterval(state.timerInterval)

    const newChess = new Chess()
    const timeSeconds = TIME_CONTROLS[config.timeControl] ?? 600

    let playerColor: Color | 'both' = 'w'
    if (config.color === 'b') playerColor = 'b'
    else if (config.color === 'random') playerColor = Math.random() > 0.5 ? 'w' : 'b'
    else if (config.mode === 'analysis') playerColor = 'both'

    set({
      chess: newChess,
      selectedSquare: null,
      legalMoves: [],
      lastMove: null,
      moveHistory: [],
      gameId: generateGameId(),
      playerColor,
      mode: config.mode,
      difficulty: config.difficulty ?? 1,
      status: 'playing',
      whiteTime: timeSeconds,
      blackTime: timeSeconds,
      activeTimer: null,
      timerInterval: null,
      evalScore: 0,
      isAIThinking: false,
      coachMessage: 'Game started! Good luck! 🎯',
    })
  },

  selectSquare: (square) => {
    const { chess } = get()
    const piece = chess.get(square)
    if (!piece) return

    const moves = chess
      .moves({ square, verbose: true })
      .map((m) => m.to as Square)

    set({ selectedSquare: square, legalMoves: moves })
  },

  clearSelection: () => {
    set({ selectedSquare: null, legalMoves: [] })
  },

  makeMove: (from, to, promotion = 'q') => {
    const state = get()
    const { chess } = state

    try {
      const moveResult = chess.move({ from, to, promotion })
      if (!moveResult) return false

      const newChess = new Chess(chess.fen())
      // chess.js is mutable so we keep the same instance

      // Determine new game status
      let status: GameState['status'] = 'playing'
      if (chess.isCheckmate()) status = 'checkmate'
      else if (chess.isStalemate() || chess.isDraw()) status = 'draw'
      else if (chess.isCheck()) status = 'check'

      // Build annotated move
      const annotatedMove: AnnotatedMove = {
        ...moveResult,
        evalScore: state.evalScore,
      }

      // Switch timers
      const prevTurn = moveResult.color
      const newActiveTimer = prevTurn === 'w' ? 'b' : 'w'

      set((s) => ({
        chess: s.chess, // same instance, now mutated
        lastMove: { from, to },
        moveHistory: [...s.moveHistory, annotatedMove],
        selectedSquare: null,
        legalMoves: [],
        status,
        activeTimer: status === 'playing' || status === 'check' ? newActiveTimer : null,
      }))

      return true
    } catch {
      return false
    }
  },

  setEvalScore: (score) => set({ evalScore: score }),
  setCoachMessage: (msg) => set({ coachMessage: msg }),
  setAIThinking: (thinking) => set({ isAIThinking: thinking }),
  setOpponentOnline: (online) => set({ opponentOnline: online }),

  resetGame: () => {
    const state = get()
    if (state.timerInterval) clearInterval(state.timerInterval)
    const newChess = new Chess()
    set({
      chess: newChess,
      selectedSquare: null,
      legalMoves: [],
      lastMove: null,
      moveHistory: [],
      status: 'idle',
      activeTimer: null,
      timerInterval: null,
      evalScore: 0,
      isAIThinking: false,
      coachMessage: 'Ready for a new game!',
    })
  },

  loadPGN: (pgn) => {
    const newChess = new Chess()
    newChess.loadPgn(pgn)
    const history = newChess.history({ verbose: true }) as AnnotatedMove[]
    set({ chess: newChess, moveHistory: history, status: 'playing' })
  },

  startTimer: () => {
    const state = get()
    if (state.timerInterval) clearInterval(state.timerInterval)
    const interval = setInterval(() => get().tick(), 1000)
    set({ timerInterval: interval, activeTimer: 'w' })
  },

  stopTimer: () => {
    const state = get()
    if (state.timerInterval) clearInterval(state.timerInterval)
    set({ timerInterval: null, activeTimer: null })
  },

  tick: () => {
    const state = get()
    if (!state.activeTimer || state.status === 'checkmate' || state.status === 'draw') return

    if (state.activeTimer === 'w') {
      const newTime = state.whiteTime - 1
      if (newTime <= 0) {
        set({ whiteTime: 0, status: 'checkmate' }) // time out = loss
        get().stopTimer()
      } else {
        set({ whiteTime: newTime })
      }
    } else {
      const newTime = state.blackTime - 1
      if (newTime <= 0) {
        set({ blackTime: 0, status: 'checkmate' })
        get().stopTimer()
      } else {
        set({ blackTime: newTime })
      }
    }
  },
}))

function generateGameId(): string {
  return Math.random().toString(36).substring(2, 10)
}
