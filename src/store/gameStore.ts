// src/store/gameStore.ts
import { create } from 'zustand'
import { Chess, Square, Move } from 'chess.js'
import { supabase } from '@/lib/supabase/supabase'
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
  gameStartTime: number | null

  // Clocks
  whiteTime: number
  blackTime: number
  activeTimer: 'w' | 'b' | null
  timerInterval: NodeJS.Timeout | null

  // Analysis
  evalScore: number
  prevEvalScore: number
  isAnalyzing: boolean
  coachMessage: string

  // Live accuracy
  liveWhiteAccuracy: number | null
  liveBlackAccuracy: number | null
  whiteScoreSum: number
  blackScoreSum: number
  whiteMoveCount: number
  blackMoveCount: number

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
  saveGame: (result: 'win' | 'loss' | 'draw') => Promise<void>
}

const TIME_CONTROLS: Record<string, number> = {
  '1+0': 60,
  '3+0': 180,
  '5+0': 300,
  '10+0': 600,
  '15+10': 900,
  '30+0': 1800,
}

const ACCURACY_WEIGHTS: Record<string, number> = {
  best: 100,
  good: 85,
  inaccuracy: 60,
  mistake: 30,
  blunder: 0,
}

function annotateMoveType(
  evalBefore: number,
  evalAfter: number,
  color: 'w' | 'b'
): string {
  const clamp = (v: number) => Math.max(-15, Math.min(15, v))
  const before = clamp(evalBefore)
  const after  = clamp(evalAfter)
  const delta  = color === 'w' ? after - before : before - after

  if (delta >= -0.1)  return 'best'
  if (delta >= -0.3)  return 'good'
  if (delta >= -0.6)  return 'inaccuracy'
  if (delta >= -1.5)  return 'mistake'
  return 'blunder'
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
  gameStartTime: null,

  whiteTime: 600,
  blackTime: 600,
  activeTimer: null,
  timerInterval: null,

  evalScore: 0,
  prevEvalScore: 0,
  isAnalyzing: false,
  coachMessage: 'Welcome! Start a game and I\'ll analyze your moves.',

  liveWhiteAccuracy: null,
  liveBlackAccuracy: null,
  whiteScoreSum: 0,
  blackScoreSum: 0,
  whiteMoveCount: 0,
  blackMoveCount: 0,

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
      gameStartTime: Date.now(),
      whiteTime: timeSeconds,
      blackTime: timeSeconds,
      activeTimer: null,
      timerInterval: null,
      evalScore: 0,
      prevEvalScore: 0,
      isAIThinking: false,
      coachMessage: 'Game started! Good luck! 🎯',
      liveWhiteAccuracy: null,
      liveBlackAccuracy: null,
      whiteScoreSum: 0,
      blackScoreSum: 0,
      whiteMoveCount: 0,
      blackMoveCount: 0,
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

      // Live accuracy update using eval delta
      const color = moveResult.color as 'w' | 'b'
      const moveType = annotateMoveType(state.prevEvalScore, state.evalScore, color)
      const moveScore = ACCURACY_WEIGHTS[moveType] ?? 85

      let newWhiteScoreSum = state.whiteScoreSum
      let newBlackScoreSum = state.blackScoreSum
      let newWhiteMoveCount = state.whiteMoveCount
      let newBlackMoveCount = state.blackMoveCount

      if (color === 'w') {
        newWhiteScoreSum += moveScore
        newWhiteMoveCount += 1
      } else {
        newBlackScoreSum += moveScore
        newBlackMoveCount += 1
      }

      const liveWhiteAccuracy = newWhiteMoveCount > 0
        ? Math.round(newWhiteScoreSum / newWhiteMoveCount)
        : null
      const liveBlackAccuracy = newBlackMoveCount > 0
        ? Math.round(newBlackScoreSum / newBlackMoveCount)
        : null

      // Switch timers
      const prevTurn = moveResult.color
      const newActiveTimer = prevTurn === 'w' ? 'b' : 'w'

      set((s) => ({
        chess: s.chess,
        lastMove: { from, to },
        moveHistory: [...s.moveHistory, annotatedMove],
        selectedSquare: null,
        legalMoves: [],
        status,
        activeTimer: status === 'playing' || status === 'check' ? newActiveTimer : null,
        prevEvalScore: state.evalScore,
        whiteScoreSum: newWhiteScoreSum,
        blackScoreSum: newBlackScoreSum,
        whiteMoveCount: newWhiteMoveCount,
        blackMoveCount: newBlackMoveCount,
        liveWhiteAccuracy,
        liveBlackAccuracy,
      }))

      // Save game if it just ended
      if (status === 'checkmate' || status === 'draw') {
        const { playerColor } = get()
        let result: 'win' | 'loss' | 'draw' = 'draw'
        if (status === 'checkmate') {
          result = moveResult.color === playerColor ? 'win' : 'loss'
        }
        get().saveGame(result)
      }

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
      gameStartTime: null,
      activeTimer: null,
      timerInterval: null,
      evalScore: 0,
      prevEvalScore: 0,
      isAIThinking: false,
      coachMessage: 'Ready for a new game!',
      liveWhiteAccuracy: null,
      liveBlackAccuracy: null,
      whiteScoreSum: 0,
      blackScoreSum: 0,
      whiteMoveCount: 0,
      blackMoveCount: 0,
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
        set({ whiteTime: 0, status: 'checkmate' })
        get().stopTimer()
        const { playerColor } = get()
        get().saveGame(playerColor === 'w' ? 'loss' : 'win')
      } else {
        set({ whiteTime: newTime })
      }
    } else {
      const newTime = state.blackTime - 1
      if (newTime <= 0) {
        set({ blackTime: 0, status: 'checkmate' })
        get().stopTimer()
        const { playerColor } = get()
        get().saveGame(playerColor === 'b' ? 'loss' : 'win')
      } else {
        set({ blackTime: newTime })
      }
    }
  },

  saveGame: async (result) => {
    const state = get()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const duration = state.gameStartTime
      ? Math.floor((Date.now() - state.gameStartTime) / 1000)
      : 0

    const playerColor = state.playerColor === 'both' ? 'w' : state.playerColor

    const { error } = await supabase.from('games').insert({
      player_id: user.id,
      result,
      player_color: playerColor,
      difficulty: state.difficulty,
      moves: state.moveHistory.length,
      duration,
      pgn: state.chess.pgn(),
    })

    if (error) console.error('Failed to save game:', error)
  },
}))

function generateGameId(): string {
  return Math.random().toString(36).substring(2, 10)
}
