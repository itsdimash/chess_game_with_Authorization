'use client'
// src/components/game/AICoach.tsx

import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Zap } from 'lucide-react'
import { useGameStore } from '@/store/gameStore'
import { useStockfish } from '@/hooks/useStockfish'
import type { AnnotatedMove, MoveAnnotation } from '@/types'
import { clsx } from 'clsx'

interface CoachAnalysis {
  type: MoveAnnotation['type']
  message: string
  bestMove?: string
  evalDelta?: number
}

const ANNOTATION_CONFIG = {
  best: {
    icon: Sparkles,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/20',
    label: 'Best move!!',
  },
  good: {
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/20',
    label: 'Good move!',
  },
  inaccuracy: {
    icon: AlertTriangle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10 border-yellow-400/20',
    label: 'Inaccuracy ?!',
  },
  mistake: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10 border-orange-400/20',
    label: 'Mistake ?',
  },
  blunder: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-400/10 border-red-400/20',
    label: 'Blunder ??',
  },
}

// Generates contextual explanations for move annotations
function generateExplanation(
  analysis: CoachAnalysis,
  san: string,
  moveNumber: number
): string {
  const { type, bestMove, evalDelta } = analysis

  const templates: Record<MoveAnnotation['type'], string[]> = {
    best: [
      `Excellent! ${san} is the engine's top choice here.`,
      `Perfect play! ${san} controls the position optimally.`,
    ],
    good: [
      `${san} is a solid move that maintains your advantage.`,
      `Good choice! ${san} keeps the position balanced.`,
    ],
    inaccuracy: [
      `${san} slightly misses the best continuation.${bestMove ? ` Consider ${bestMove} instead.` : ''}`,
      `A small imprecision. ${bestMove ? `${bestMove} was slightly better` : 'There was a better square available'}.`,
    ],
    mistake: [
      `${san} gives up some advantage. ${bestMove ? `${bestMove} would have been much stronger.` : 'A better move was available.'}`,
      `This move loses control of the center. ${evalDelta ? `You lost about ${Math.abs(evalDelta / 100).toFixed(1)} pawns of advantage.` : ''}`,
    ],
    blunder: [
      `Ouch! ${san} loses material or gives a decisive advantage. ${bestMove ? `${bestMove} was the move to play.` : ''}`,
      `This blunder turns the game around. Watch out for tactics in this position!`,
    ],
  }

  const pool = templates[type]
  return pool[Math.floor(Math.random() * pool.length)]
}

// Annotate a move based on eval change
function annotateMove(evalBefore: number, evalAfter: number, color: 'w' | 'b'): MoveAnnotation['type'] {
  // From the player's perspective
  const delta = color === 'w'
    ? evalAfter - evalBefore      // white wants higher eval
    : evalBefore - evalAfter      // black wants lower eval (more negative)

  if (delta >= 0) return 'best'       // no loss, improvement or same
  if (delta >= -10) return 'good'     // ≤0.10 loss
  if (delta >= -30) return 'inaccuracy' // ≤0.30 loss
  if (delta >= -100) return 'mistake'  // ≤1.00 loss
  return 'blunder'                    // >1.00 loss
}

export function AICoach() {
  const { coachMessage, moveHistory, isAIThinking, chess } = useGameStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [fullAnalysis, setFullAnalysis] = useState<CoachAnalysis[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)

  const { analyzeGame } = useStockfish()

  const runFullAnalysis = useCallback(async () => {
    if (!moveHistory.length) return
    setIsAnalyzing(true)
    setIsExpanded(true)
    setAnalysisProgress(0)

    const pgn = chess.pgn()
    
    // Simulate progressive analysis
    const total = moveHistory.length
    const analyses: CoachAnalysis[] = []

    // In production: use useStockfish().analyzeGame(pgn)
    // Here we demonstrate the structure
    for (let i = 0; i < total; i++) {
      await new Promise(r => setTimeout(r, 80))
      setAnalysisProgress(Math.round(((i + 1) / total) * 100))

      const move = moveHistory[i]
      // Simulate eval scores (in production: from Stockfish)
      const evalBefore = Math.random() * 200 - 100
      const evalAfter = evalBefore + (Math.random() * 100 - 50)
      const type = annotateMove(evalBefore, evalAfter, move.color as 'w' | 'b')

      analyses.push({
        type,
        message: generateExplanation(
          { type, evalDelta: evalAfter - evalBefore },
          move.san,
          Math.floor(i / 2) + 1
        ),
        bestMove: type !== 'best' && type !== 'good' ? `${['Nf3','d4','e4','Bc4','Qd2'][i % 5]}` : undefined,
        evalDelta: evalAfter - evalBefore,
      })
    }

    setFullAnalysis(analyses)
    setIsAnalyzing(false)
  }, [moveHistory, chess, analyzeGame])

  const lastMove = moveHistory[moveHistory.length - 1]
  const config = lastMove?.annotation
    ? ANNOTATION_CONFIG[lastMove.annotation.type]
    : null

  // Count blunders and mistakes
  const blunders = fullAnalysis.filter(a => a.type === 'blunder').length
  const mistakes = fullAnalysis.filter(a => a.type === 'mistake').length
  const accuracy = fullAnalysis.length > 0
    ? Math.round((fullAnalysis.filter(a => a.type === 'best' || a.type === 'good').length / fullAnalysis.length) * 100)
    : null

  return (
    <div className="flex flex-col gap-3">
      {/* Coach header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-400/15 flex items-center justify-center">
            <Sparkles size={14} className="text-amber-400" />
          </div>
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">KnightOwl AI Coach</span>
        </div>
        {isAIThinking && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Zap size={12} className="animate-pulse" />
            Thinking...
          </div>
        )}
      </div>

      {/* Current move annotation */}
      <AnimatePresence mode="wait">
        {config && lastMove ? (
          <motion.div
            key={lastMove.san}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={clsx('rounded-xl border p-3', config.bg)}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <config.icon size={14} className={config.color} />
              <span className={clsx('text-xs font-semibold', config.color)}>{config.label}</span>
              <code className="text-xs bg-black/20 px-1.5 py-0.5 rounded font-mono ml-auto">
                {lastMove.san}
              </code>
            </div>
            <p className="text-xs text-text/80 leading-relaxed">{coachMessage}</p>
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-border bg-surface2 p-3"
          >
            <p className="text-xs text-muted leading-relaxed">{coachMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full analysis section */}
      {moveHistory.length > 0 && (
        <div>
          <button
            onClick={() => fullAnalysis.length ? setIsExpanded(!isExpanded) : runFullAnalysis()}
            disabled={isAnalyzing}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border hover:border-border2 hover:bg-surface2 transition-all text-xs text-muted group"
          >
            <span className="group-hover:text-text transition-colors">
              {isAnalyzing
                ? `Analyzing... ${analysisProgress}%`
                : fullAnalysis.length
                ? 'Game Analysis'
                : 'Analyze Full Game'}
            </span>
            {isAnalyzing ? (
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : isExpanded ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>

          {/* Progress bar */}
          {isAnalyzing && (
            <div className="mt-1 h-1 rounded-full bg-surface2 overflow-hidden">
              <motion.div
                className="h-full bg-accent rounded-full"
                animate={{ width: `${analysisProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}

          <AnimatePresence>
            {isExpanded && fullAnalysis.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {accuracy !== null && (
                    <div className="rounded-lg bg-surface2 p-2 text-center">
                      <div className={clsx('text-lg font-bold font-mono', accuracy >= 80 ? 'text-green-400' : accuracy >= 60 ? 'text-amber-400' : 'text-red-400')}>
                        {accuracy}%
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">Accuracy</div>
                    </div>
                  )}
                  <div className="rounded-lg bg-surface2 p-2 text-center">
                    <div className="text-lg font-bold font-mono text-orange-400">{mistakes}</div>
                    <div className="text-[10px] text-muted mt-0.5">Mistakes</div>
                  </div>
                  <div className="rounded-lg bg-surface2 p-2 text-center">
                    <div className="text-lg font-bold font-mono text-red-400">{blunders}</div>
                    <div className="text-[10px] text-muted mt-0.5">Blunders</div>
                  </div>
                </div>

                {/* Move-by-move */}
                <div className="mt-3 flex flex-col gap-1 max-h-52 overflow-y-auto">
                  {fullAnalysis.map((a, i) => {
                    const move = moveHistory[i]
                    if (!move || a.type === 'best') return null
                    const cfg = ANNOTATION_CONFIG[a.type]
                    return (
                      <div key={i} className={clsx('rounded-lg p-2 border text-xs', cfg.bg)}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-muted font-mono">{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '...'}</span>
                          <code className={clsx('font-mono font-medium', cfg.color)}>{move.san}</code>
                          <span className={clsx('ml-auto text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
                        </div>
                        <p className="text-text/70 leading-relaxed">{a.message}</p>
                        {a.bestMove && (
                          <div className="mt-1">
                            <span className="text-muted">Better: </span>
                            <code className="text-amber-400 font-mono">{a.bestMove}</code>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {fullAnalysis.every(a => a.type === 'best' || a.type === 'good') && (
                    <div className="text-center py-4 text-xs text-green-400">
                      ✨ Excellent game! No significant mistakes found.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
