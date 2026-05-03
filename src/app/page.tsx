'use client'

import { useState, useEffect } from 'react'
import { ChessBoard } from '@/components/game/ChessBoard'
import { AICoach } from '@/components/game/AICoach'
import { AuthModal } from '@/components/AuthModal'
import { Leaderboard } from '@/components/Leaderboard'
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
    <main className="min-h-screen bg-background flex flex-col items-center p-2 sm:p-4 gap-4 sm:gap-6 relative overflow-x-hidden">

      {/* Ambient top vignette */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-48 z-0"
        style={{ background: 'linear-gradient(to bottom, rgba(200,169,110,0.04) 0%, transparent 100%)' }} />

      {/* ── Header ── */}
      <header className="w-full flex items-center justify-between max-w-6xl pt-3 px-2 relative z-10">
        <div className="flex items-center gap-3">
          {/* Candle-flicker chess piece icon */}
          <span className="text-2xl candle-flicker" style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(200,169,110,0.5))' }}>♞</span>
          <div>
            <h1 className="font-display text-lg sm:text-xl tracking-[0.15em] uppercase"
              style={{ color: 'var(--accent)', textShadow: '0 0 20px rgba(200,169,110,0.3)' }}>
              KnightOwl
            </h1>
            <p className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)', marginTop: '-2px' }}>
              Chess
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {!authLoading && (
            user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-xs tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
                  {user.user_metadata?.user_name || user.email?.split('@')[0]}
                </span>
                <button onClick={signOut} className="btn-ghost px-3 py-1.5 rounded-lg text-xs">
                  Leave
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)} className="btn-gold px-4 py-1.5 rounded-lg text-xs">
                Sign in
              </button>
            )
          )}
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="flex gap-1 p-1 rounded-xl relative z-10"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {(['game', 'leaderboard'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="relative px-5 py-2 rounded-lg text-xs transition-all duration-200"
            style={{
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: activeTab === tab ? 'var(--accent)' : 'var(--muted)',
              background: activeTab === tab ? 'var(--surface2)' : 'transparent',
              border: activeTab === tab ? '1px solid var(--border2)' : '1px solid transparent',
              boxShadow: activeTab === tab ? '0 0 12px var(--glow)' : 'none',
            }}
          >
            {tab === 'game' ? '♟ Game' : '⚜ Leaderboard'}
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <div className="w-full relative z-10 flex justify-center">
        {activeTab === 'leaderboard' ? (
          <Leaderboard />
        ) : !gameStarted ? (
          <GameSetup
            onStart={handleStartGame}
            boardTheme={boardTheme}
            setBoardTheme={setBoardTheme}
          />
        ) : (
          <div className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-center lg:items-start lg:justify-center">
            {/* Board */}
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

            {/* Side panel */}
            <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 fade-in-up">
              <div className="rounded-2xl overflow-hidden"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}>

                {/* Timer */}
                <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <TimerDisplay />
                </div>

                {/* Coach */}
                <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <AICoach />
                </div>

                {/* Status + actions */}
                <div className="p-4 flex flex-col gap-3">
                  <StatusBanner status={status} />
                  {!user && (status === 'checkmate' || status === 'draw') && (
                    <p className="text-xs text-center" style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
                      <button onClick={() => setShowAuth(true)} className="hover:underline" style={{ color: 'var(--accent)' }}>
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
                    className="btn-ghost w-full py-2.5 rounded-xl text-xs"
                  >
                    ↩ New Game
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </main>
  )
}

/* ── Timer ── */
function TimerDisplay() {
  const { whiteTime, blackTime, activeTimer, playerColor } = useGameStore()
  const fmt = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const Clock = ({ color, label, time, active }: { color: 'w'|'b', label: string, time: number, active: boolean }) => (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300"
      style={{
        background: active ? 'rgba(200,169,110,0.07)' : 'var(--surface2)',
        border: `1px solid ${active ? 'var(--accent-dim)' : 'var(--border)'}`,
        boxShadow: active ? '0 0 16px var(--glow)' : 'none',
      }}>
      <span className="text-xs tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
        {label}
      </span>
      <span className="font-mono text-base font-medium tabular-nums"
        style={{
          color: time <= 30 ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--text)',
          fontFamily: 'var(--font-mono)',
          textShadow: active ? '0 0 10px var(--glow-strong)' : 'none',
        }}>
        {fmt(time)}
      </span>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <Clock color="b" label={playerColor === 'w' ? '⚔ Opponent' : '♟ You'} time={blackTime} active={activeTimer === 'b'} />
      <Clock color="w" label={playerColor === 'b' ? '⚔ Opponent' : '♟ You'} time={whiteTime} active={activeTimer === 'w'} />
    </div>
  )
}

/* ── Game Setup ── */
function GameSetup({ onStart, boardTheme, setBoardTheme }: {
  onStart: (config: GameConfig) => void
  boardTheme: ThemeKey
  setBoardTheme: (t: ThemeKey) => void
}) {
  const [mode, setMode] = useState<'ai' | 'analysis'>('ai')
  const [timeControl, setTimeControl] = useState<any>('10+0')
  const [difficulty, setDifficulty] = useState<any>(3)
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w')

  const diffLabels: Record<number, string> = { 1: 'Novice', 2: 'Casual', 3: 'Club', 4: 'Expert', 5: 'Master' }

  const OptionBtn = ({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) => (
    <button onClick={onClick}
      className="flex-1 py-2.5 rounded-xl text-xs transition-all duration-200"
      style={{
        fontFamily: 'var(--font-display)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        background: active ? 'rgba(200,169,110,0.08)' : 'var(--surface2)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? 'var(--accent)' : 'var(--text2)',
        boxShadow: active ? '0 0 12px var(--glow)' : 'none',
      }}>
      {children}
    </button>
  )

  return (
    <div className="fade-in-up w-full max-w-md flex flex-col gap-5 rounded-2xl p-6 sm:p-8"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 32px 96px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>

      {/* Title */}
      <div className="text-center mb-1">
        <h2 className="font-display text-2xl tracking-[0.2em] uppercase"
          style={{ color: 'var(--accent)', textShadow: '0 0 20px rgba(200,169,110,0.25)' }}>
          New Game
        </h2>
        <div className="divider mt-3" />
      </div>

      {/* Mode */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Mode</label>
        <div className="flex gap-2">
          <OptionBtn active={mode === 'ai'} onClick={() => setMode('ai')}>⚔ vs AI</OptionBtn>
          <OptionBtn active={mode === 'analysis'} onClick={() => setMode('analysis')}>◎ Analysis</OptionBtn>
        </div>
      </div>

      {/* Time Control */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Time Control</label>
        <div className="grid grid-cols-3 gap-2">
          {(['1+0', '3+0', '5+0', '10+0', '15+10', '30+0'] as const).map(tc => (
            <OptionBtn key={tc} active={timeControl === tc} onClick={() => setTimeControl(tc)}>{tc}</OptionBtn>
          ))}
        </div>
      </div>

      {mode === 'ai' && (
        <>
          {/* Difficulty */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Difficulty</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className="flex-1 py-2.5 rounded-xl text-xs transition-all duration-200 flex flex-col items-center gap-0.5"
                  style={{
                    fontFamily: 'var(--font-display)',
                    background: difficulty === d ? 'rgba(200,169,110,0.08)' : 'var(--surface2)',
                    border: `1px solid ${difficulty === d ? 'var(--accent)' : 'var(--border)'}`,
                    color: difficulty === d ? 'var(--accent)' : 'var(--text2)',
                    boxShadow: difficulty === d ? '0 0 12px var(--glow)' : 'none',
                  }}>
                  <span className="text-sm font-semibold">{d}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-center tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
              {diffLabels[difficulty]}
            </p>
          </div>

          {/* Color */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Play as</label>
            <div className="flex gap-2">
              {(['w', 'b', 'random'] as const).map(c => (
                <OptionBtn key={c} active={color === c} onClick={() => setColor(c)}>
                  {c === 'w' ? '♔ White' : c === 'b' ? '♚ Black' : '⚄ Random'}
                </OptionBtn>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Board Color */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Board</label>
        <div className="flex gap-2">
          {(Object.entries(BOARD_THEMES) as [ThemeKey, typeof BOARD_THEMES[ThemeKey]][]).map(([key, t]) => (
            <button key={key} onClick={() => setBoardTheme(key)} title={t.label}
              className="flex-1 h-7 rounded-lg overflow-hidden transition-all duration-200"
              style={{
                border: `2px solid ${boardTheme === key ? 'var(--accent)' : 'transparent'}`,
                boxShadow: boardTheme === key ? '0 0 10px var(--glow)' : 'none',
              }}>
              <div className="flex h-full">
                <div className="flex-1" style={{ background: t.light }} />
                <div className="flex-1" style={{ background: t.dark }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Start */}
      <button
        onClick={() => onStart({ mode, timeControl, difficulty, color })}
        className="btn-gold w-full py-3.5 rounded-xl mt-1"
        style={{ fontSize: '0.8rem', letterSpacing: '0.15em' }}
      >
        Begin Match
      </button>
    </div>
  )
}

/* ── Status Banner ── */
function StatusBanner({ status }: { status: string }) {
  const config: Record<string, { icon: string; color: string; label: string }> = {
    playing:   { icon: '♟', color: 'var(--text2)',  label: 'In Progress' },
    check:     { icon: '⚠', color: '#e8a83a',       label: 'Check!' },
    checkmate: { icon: '♚', color: 'var(--danger)',  label: 'Checkmate' },
    stalemate: { icon: '⚖', color: 'var(--muted)',   label: 'Stalemate' },
    draw:      { icon: '⚖', color: 'var(--muted)',   label: 'Draw' },
    idle:      { icon: '◎', color: 'var(--muted)',   label: 'Ready' },
  }
  const c = config[status] ?? config.idle
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <span style={{ color: c.color, filter: status === 'check' ? 'drop-shadow(0 0 6px rgba(232,168,58,0.6))' : 'none' }}>{c.icon}</span>
      <span className="text-xs tracking-[0.15em] uppercase"
        style={{ color: c.color, fontFamily: 'var(--font-display)' }}>
        {c.label}
      </span>
    </div>
  )
}
