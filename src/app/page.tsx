'use client'

import { useState, useEffect } from 'react'
import { ChessBoard } from '@/components/game/ChessBoard'
import { AICoach } from '@/components/game/AICoach'
import { useGameStore } from '@/store/gameStore'
import { useStockfish } from '@/hooks/useStockfish'
import type { GameConfig } from '@/types'
import type { Square } from 'chess.js'

const BOARD_THEMES = {
  classic:  { light: '#f0d9b5', dark: '#b58863', label: 'Classic' },
  ocean:    { light: '#dee3e6', dark: '#8ca2ad', label: 'Ocean' },
  forest:   { light: '#ffffdd', dark: '#86a666', label: 'Forest' },
  purple:   { light: '#f0e4ff', dark: '#7b4fa3', label: 'Purple' },
  midnight: { light: '#c8d8e8', dark: '#2c4a6e', label: 'Midnight' },
}

type ThemeKey = keyof typeof BOARD_THEMES

export default function Home() {
  const { initGame, makeMove, status, chess, playerColor, mode, startTimer } = useGameStore()
  const [gameStarted, setGameStarted] = useState(false)
  const [boardTheme, setBoardTheme] = useState<ThemeKey>('classic')

  const handleAIMove = (from: string, to: string, promo?: string) => {
    const state = useGameStore.getState()
    if (state.status !== 'playing' && state.status !== 'check') return
    state.makeMove(from as Square, to as Square, promo)
  }

  const { analyzePosition, playAIMove, isReady } = useStockfish({
    onAnalysis: () => {},
  })

  // Trigger AI move whenever it becomes the AI's turn
  useEffect(() => {
    if (!gameStarted || mode !== 'ai') return
    const state = useGameStore.getState()
    if (state.status !== 'playing' && state.status !== 'check') return

    const aiColor = playerColor === 'w' ? 'b' : 'w'
    if (chess.turn() === aiColor) {
      const timeout = setTimeout(() => {
        const s = useGameStore.getState()
        if (s.status !== 'playing' && s.status !== 'check') return
        playAIMove(s.chess.fen(), handleAIMove)
      }, 300)
      return () => clearTimeout(timeout)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess.fen(), gameStarted, mode, playerColor, isReady])

  const handleStartGame = (config: GameConfig) => {
    initGame(config)
    setGameStarted(true)
    // Start timer after store updates
    setTimeout(() => {
      useGameStore.getState().startTimer()
    }, 100)
  }

  const handleMove = (from: Square, to: Square, promotion?: string) => {
    const success = makeMove(from, to, promotion)
    if (!success) return
    const state = useGameStore.getState()
    analyzePosition(state.chess.fen())
    // AI response is handled by the useEffect above
  }

  const theme = BOARD_THEMES[boardTheme]

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-6">
      <h1 className="text-3xl font-bold text-accent tracking-tight">♞ KnightOwl Chess</h1>

      {!gameStarted ? (
        <GameSetup onStart={handleStartGame} boardTheme={boardTheme} setBoardTheme={setBoardTheme} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <ChessBoard
            onMove={handleMove}
            interactive={status === 'playing' || status === 'check'}
            lightSquareColor={theme.light}
            darkSquareColor={theme.dark}
          />
          <div className="w-full lg:w-72 bg-surface border border-border rounded-2xl p-4">
            <TimerDisplay />
            <AICoach />
            <div className="mt-4 pt-4 border-t border-border">
              <StatusBanner status={status} />
              <button
                onClick={() => {
                  useGameStore.getState().resetGame()
                  setGameStarted(false)
                }}
                className="mt-3 w-full py-2 rounded-lg border border-border hover:border-accent hover:text-accent text-sm text-muted transition-all"
              >
                New Game
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function TimerDisplay() {
  const { whiteTime, blackTime, activeTimer, playerColor } = useGameStore()

  const fmt = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const isWhiteActive = activeTimer === 'w'
  const isBlackActive = activeTimer === 'b'

  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className={`flex items-center justify-between px-4 py-2 rounded-lg border transition-all ${
        isBlackActive ? 'border-accent bg-accent/10' : 'border-border'
      }`}>
        <span className="text-sm text-muted">
          {playerColor === 'w' ? '🤖 AI (Black)' : '♚ You (Black)'}
        </span>
        <span className={`font-mono font-bold text-lg ${isBlackActive ? 'text-accent' : 'text-text'} ${blackTime <= 30 ? 'text-red-400' : ''}`}>
          {fmt(blackTime)}
        </span>
      </div>

      <div className={`flex items-center justify-between px-4 py-2 rounded-lg border transition-all ${
        isWhiteActive ? 'border-accent bg-accent/10' : 'border-border'
      }`}>
        <span className="text-sm text-muted">
          {playerColor === 'b' ? '🤖 AI (White)' : '♔ You (White)'}
        </span>
        <span className={`font-mono font-bold text-lg ${isWhiteActive ? 'text-accent' : 'text-text'} ${whiteTime <= 30 ? 'text-red-400' : ''}`}>
          {fmt(whiteTime)}
        </span>
      </div>
    </div>
  )
}

function GameSetup({ onStart, boardTheme, setBoardTheme }: {
  onStart: (config: GameConfig) => void
  boardTheme: ThemeKey
  setBoardTheme: (t: ThemeKey) => void
}) {
  const [mode, setMode] = useState<'ai' | 'analysis'>('ai')
  const [timeControl, setTimeControl] = useState<any>('10+0')
  const [difficulty, setDifficulty] = useState<any>(3)
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w')

  return (
    <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-md flex flex-col gap-5">
      <h2 className="text-xl font-semibold text-text">New Game</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted uppercase tracking-wide">Mode</label>
        <div className="flex gap-2">
          {(['ai', 'analysis'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg border text-sm transition-all capitalize ${mode === m ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'}`}>
              {m === 'ai' ? '🤖 vs AI' : '🔍 Analysis'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted uppercase tracking-wide">Time Control</label>
        <div className="flex flex-wrap gap-2">
          {(['1+0', '3+0', '5+0', '10+0', '15+10', '30+0'] as const).map(tc => (
            <button key={tc} onClick={() => setTimeControl(tc)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${timeControl === tc ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'}`}>
              {tc}
            </button>
          ))}
        </div>
      </div>

      {mode === 'ai' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted uppercase tracking-wide">Difficulty</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-lg border text-sm transition-all ${difficulty === d ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'}`}>
                  {d}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">1 = Easy · 5 = Expert</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted uppercase tracking-wide">Play as</label>
            <div className="flex gap-2">
              {(['w', 'b', 'random'] as const).map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`flex-1 py-2 rounded-lg border text-sm transition-all ${color === c ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'}`}>
                  {c === 'w' ? '♔ White' : c === 'b' ? '♚ Black' : '🎲 Random'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted uppercase tracking-wide">Board Color</label>
        <div className="flex gap-2">
          {(Object.entries(BOARD_THEMES) as [ThemeKey, typeof BOARD_THEMES[ThemeKey]][]).map(([key, theme]) => (
            <button key={key} onClick={() => setBoardTheme(key)}
              title={theme.label}
              className={`flex-1 h-8 rounded-lg border-2 transition-all overflow-hidden ${boardTheme === key ? 'border-accent' : 'border-transparent'}`}>
              <div className="flex h-full">
                <div className="flex-1" style={{ background: theme.light }} />
                <div className="flex-1" style={{ background: theme.dark }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onStart({ mode, timeControl, difficulty, color })}
        className="w-full py-3 rounded-xl bg-accent text-black font-semibold hover:brightness-110 transition-all"
      >
        Start Game
      </button>
    </div>
  )
}

function StatusBanner({ status }: { status: string }) {
  const messages: Record<string, string> = {
    playing: '♟ Game in progress',
    check: '⚠️ Check!',
    checkmate: '🏁 Checkmate!',
    stalemate: '🤝 Stalemate — Draw',
    draw: '🤝 Draw',
    idle: 'Ready to play',
  }
  return (
    <div className="text-center text-sm font-medium text-text/80">
      {messages[status] ?? status}
    </div>
  )
}
