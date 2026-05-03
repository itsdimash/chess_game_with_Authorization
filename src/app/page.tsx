'use client'

import { useState, useEffect } from 'react'
import { ChessBoard } from '@/components/game/ChessBoard'
import { AICoach } from '@/components/game/AICoach'
import { AuthModal } from '@/components/AuthModal'
import { Leaderboard } from '@/components/Leaderboard'
import { ThemeToggle } from '@/components/ThemeProvider'
import { useGameStore } from '@/store/gameStore'
import { useStockfish } from '@/hooks/useStockfish'
import { useAuth } from '@/hooks/useAuth'
import type { GameConfig } from '@/types'
import type { Square } from 'chess.js'

const BOARD_THEMES = {
  classic:  { light: '#f0d9b5', dark: '#b58863', label: 'Classic' },
  ocean:    { light: '#dee3e6', dark: '#8ca2ad', label: 'Ocean' },
  forest:   { light: '#ffffdd', dark: '#86a666', label: 'Forest' },
  purple:   { light: '#f0e4ff', dark: '#7b4fa3', label: 'Purple' },
  midnight: { light: '#c8d8e8', dark: '#2c4a6e', label: 'Midnight' },
  pikmi:    { light: '#ffe4f0', dark: '#e8759a', label: 'Pikmi' },
}

type ThemeKey = keyof typeof BOARD_THEMES
type Tab = 'game' | 'leaderboard'

function useBoardSize() {
  const [size, setSize] = useState(560)
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w < 640) {
        setSize(Math.floor(Math.min(w - 16, h * 0.55) / 8) * 8)
      } else if (w < 1024) {
        setSize(Math.floor(Math.min(Math.min(w - 48, h * 0.65), 520) / 8) * 8)
      } else {
        setSize(Math.floor(Math.min(h - 160, w * 0.55, 600) / 8) * 8)
      }
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])
  return size
}

export default function Home() {
  const { initGame, makeMove, status, chess, playerColor, mode } = useGameStore()
  const { user, loading: authLoading, signOut } = useAuth()
  const [gameStarted, setGameStarted] = useState(false)
  const [boardTheme, setBoardTheme] = useState<ThemeKey>('classic')
  const [showAuth, setShowAuth] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('game')
  const boardSize = useBoardSize()

  const { analyzePosition, playAIMove, isReady } = useStockfish({ onAnalysis: () => {} })

  const handleAIMove = (from: string, to: string, promo?: string) => {
    const state = useGameStore.getState()
    if (state.status !== 'playing' && state.status !== 'check') return
    state.makeMove(from as Square, to as Square, promo)
    analyzePosition(useGameStore.getState().chess.fen())
  }

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
    setTimeout(() => useGameStore.getState().startTimer(), 100)
  }

  const handleMove = (from: Square, to: Square, promotion?: string) => {
    const success = makeMove(from, to, promotion)
    if (!success) return
    analyzePosition(useGameStore.getState().chess.fen())
  }

  const theme = BOARD_THEMES[boardTheme]

  return (
    <main className="min-h-screen bg-background flex flex-col items-center p-2 sm:p-4 gap-3 sm:gap-6">
      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-5xl pt-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-accent tracking-tight">
          ♞ KnightOwl Chess
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!authLoading && (
            user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted hidden sm:block">
                  {user.user_metadata?.user_name || user.email?.split('@')[0]}
                </span>
                <button
                  onClick={signOut}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:border-accent hover:text-accent transition-all"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="px-3 py-1.5 rounded-lg bg-accent text-black text-xs font-semibold hover:brightness-110 transition-all"
              >
                Sign in
              </button>
            )
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['game', 'leaderboard'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg border text-sm transition-all ${
              activeTab === tab
                ? 'border-accent text-accent bg-accent/10'
                : 'border-border text-muted hover:border-border2'
            }`}
          >
            {tab === 'game' ? '♟ Game' : '🏆 Leaderboard'}
          </button>
        ))}
      </div>

      {activeTab === 'leaderboard' ? (
        <Leaderboard />
      ) : !gameStarted ? (
        <GameSetup
          onStart={handleStartGame}
          boardTheme={boardTheme}
          setBoardTheme={setBoardTheme}
        />
      ) : (
        <div className="w-full flex flex-col lg:flex-row gap-3 lg:gap-6 items-center lg:items-start lg:justify-center">
          <div className="flex-shrink-0 flex justify-center w-full lg:w-auto">
            <ChessBoard
              onMove={handleMove}
              interactive={status === 'playing' || status === 'check'}
              lightSquareColor={theme.light}
              darkSquareColor={theme.dark}
              size={boardSize}
              showEvalBar={boardSize >= 320}
              showCoordinates={boardSize >= 280}
            />
          </div>

          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4">
              <TimerDisplay />
              <AICoach />
              <div className="mt-4 pt-4 border-t border-border">
                <StatusBanner status={status} />
                {!user && (status === 'checkmate' || status === 'draw') && (
                  <p className="text-xs text-muted text-center mt-2">
                    <button onClick={() => setShowAuth(true)} className="text-accent hover:underline">
                      Sign in
                    </button>{' '}
                    to save your result to the leaderboard
                  </p>
                )}
                <button
                  onClick={() => {
                    useGameStore.getState().resetGame()
                    setGameStarted(false)
                  }}
                  className="mt-3 w-full py-2.5 rounded-lg border border-border hover:border-accent hover:text-accent text-sm text-muted transition-all"
                >
                  New Game
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
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
  return (
    <div className="flex sm:flex-col gap-2 mb-4">
      <div className={`flex flex-1 items-center justify-between px-3 sm:px-4 py-2 rounded-lg border transition-all ${
        activeTimer === 'b' ? 'border-accent bg-accent/10' : 'border-border'
      }`}>
        <span className="text-xs sm:text-sm text-muted truncate mr-2">
          {playerColor === 'w' ? '🤖 AI (Black)' : '♚ You (Black)'}
        </span>
        <span className={`font-mono font-bold text-base sm:text-lg flex-shrink-0 ${
          activeTimer === 'b' ? 'text-accent' : 'text-text'
        } ${blackTime <= 30 ? 'text-red-400' : ''}`}>
          {fmt(blackTime)}
        </span>
      </div>
      <div className={`flex flex-1 items-center justify-between px-3 sm:px-4 py-2 rounded-lg border transition-all ${
        activeTimer === 'w' ? 'border-accent bg-accent/10' : 'border-border'
      }`}>
        <span className="text-xs sm:text-sm text-muted truncate mr-2">
          {playerColor === 'b' ? '🤖 AI (White)' : '♔ You (White)'}
        </span>
        <span className={`font-mono font-bold text-base sm:text-lg flex-shrink-0 ${
          activeTimer === 'w' ? 'text-accent' : 'text-text'
        } ${whiteTime <= 30 ? 'text-red-400' : ''}`}>
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
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-8 w-full max-w-md flex flex-col gap-4 sm:gap-5">
      <h2 className="text-lg sm:text-xl font-semibold text-text">New Game</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted uppercase tracking-wide">Mode</label>
        <div className="flex gap-2">
          {(['ai', 'analysis'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-lg border text-sm transition-all ${
                mode === m ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'
              }`}>
              {m === 'ai' ? '🤖 vs AI' : '🔍 Analysis'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted uppercase tracking-wide">Time Control</label>
        <div className="grid grid-cols-3 gap-2">
          {(['1+0', '3+0', '5+0', '10+0', '15+10', '30+0'] as const).map(tc => (
            <button key={tc} onClick={() => setTimeControl(tc)}
              className={`py-2 rounded-lg border text-sm transition-all ${
                timeControl === tc ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'
              }`}>
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
                  className={`flex-1 py-2.5 rounded-lg border text-sm transition-all ${
                    difficulty === d ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'
                  }`}>
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
                  className={`flex-1 py-2.5 rounded-lg border text-sm transition-all ${
                    color === c ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted hover:border-border2'
                  }`}>
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
          {(Object.entries(BOARD_THEMES) as [ThemeKey, typeof BOARD_THEMES[ThemeKey]][]).map(([key, t]) => (
            <button key={key} onClick={() => setBoardTheme(key)}
              title={t.label}
              className={`flex-1 h-8 rounded-lg border-2 transition-all overflow-hidden ${
                boardTheme === key ? 'border-accent' : 'border-transparent'
              }`}>
              <div className="flex h-full">
                <div className="flex-1" style={{ background: t.light }} />
                <div className="flex-1" style={{ background: t.dark }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onStart({ mode, timeControl, difficulty, color })}
        className="w-full py-3 rounded-xl bg-accent text-black font-semibold hover:brightness-110 transition-all text-base"
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
