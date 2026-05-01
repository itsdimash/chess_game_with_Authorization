'use client'

import { useState } from 'react'
import { ChessBoard } from '@/components/game/ChessBoard'
import { AICoach } from '@/components/game/AICoach'
import { useGameStore } from '@/store/gameStore'
import { useStockfish } from '@/hooks/useStockfish'
import type { GameConfig } from '@/types'
import type { Square } from 'chess.js'

export default function Home() {
  const { initGame, makeMove, status, chess, playerColor, mode } = useGameStore()
  const [gameStarted, setGameStarted] = useState(false)

  const { playAIMove, analyzePosition } = useStockfish({
    onAnalysis: (analysis) => {
      analyzePosition(chess.fen())
    },
  })

  const handleStartGame = (config: GameConfig) => {
    initGame(config)
    setGameStarted(true)
  }

  const handleMove = (from: Square, to: Square, promotion?: string) => {
    const success = makeMove(from, to, promotion)
    if (!success) return
    analyzePosition(chess.fen())
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-6">
      <h1 className="text-3xl font-bold text-accent tracking-tight">♞ KnightOwl Chess</h1>

      {!gameStarted ? (
        <GameSetup onStart={handleStartGame} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <ChessBoard
            onMove={handleMove}
            interactive={status === 'playing' || status === 'check'}
          />
          <div className="w-full lg:w-72 bg-surface border border-border rounded-2xl p-4">
            <AICoach />
            <div className="mt-4 pt-4 border-t border-border">
              <StatusBanner status={status} />
              <button
                onClick={() => { useGameStore.getState().resetGame(); setGameStarted(false) }}
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

function GameSetup({ onStart }: { onStart: (config: GameConfig) => void }) {
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
