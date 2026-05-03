'use client'
// src/components/game/AICoach.tsx

import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, Zap,
} from 'lucide-react'
import { useGameStore } from '@/store/gameStore'
import { useStockfish } from '@/hooks/useStockfish'
import type { MoveAnnotation } from '@/types'
import { clsx } from 'clsx'

interface CoachAnalysis {
  type: MoveAnnotation['type']
  message: string
  bestMove?: string
  evalDelta?: number
  color: 'w' | 'b'
}

const ANNOTATION_CONFIG = {
  best:       { icon: Sparkles,      color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20',  label: 'Best move!!' },
  good:       { icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20',  label: 'Good move!'  },
  inaccuracy: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20',label: 'Inaccuracy ?!'},
  mistake:    { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20',label: 'Mistake ?'   },
  blunder:    { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',      label: 'Blunder ??'  },
}

function annotateMove(evalBefore: number, evalAfter: number, color: 'w' | 'b'): MoveAnnotation['type'] {
  const clamp = (v: number) => Math.max(-15, Math.min(15, v))
  const delta = color === 'w' ? clamp(evalAfter) - clamp(evalBefore) : clamp(evalBefore) - clamp(evalAfter)
  if (delta >= -0.1) return 'best'
  if (delta >= -0.3) return 'good'
  if (delta >= -0.6) return 'inaccuracy'
  if (delta >= -1.5) return 'mistake'
  return 'blunder'
}

function makeMessage(type: MoveAnnotation['type'], san: string, bestMove?: string, delta?: number): string {
  const loss   = delta !== undefined ? Math.abs(delta).toFixed(2) : ''
  const better = bestMove ? ` Better was ${bestMove}.` : ''
  const pool: Record<MoveAnnotation['type'], string[]> = {
    best:       [`${san} is the engine's top choice — perfect play!`, `Excellent! ${san} is exactly right.`],
    good:       [`${san} is a solid move.`, `Good choice! ${san} keeps the balance.`],
    inaccuracy: [`${san} is slightly inaccurate (−${loss} pawns).${better}`, `Small imprecision with ${san}.${better}`],
    mistake:    [`${san} is a mistake (−${loss} pawns).${better}`, `${san} loses some advantage.${better}`],
    blunder:    [`${san} is a blunder! (−${loss} pawns).${better}`, `Ouch — ${san} throws away material.${better}`],
  }
  const p = pool[type]
  return p[Math.floor(Math.random() * p.length)]
}

function calcAccuracy(moves: CoachAnalysis[], color: 'w' | 'b'): number | null {
  const mine = moves.filter(m => m.color === color)
  if (!mine.length) return null
  const weights: Record<MoveAnnotation['type'], number> = { best: 100, good: 85, inaccuracy: 60, mistake: 30, blunder: 0 }
  return Math.round(mine.reduce((sum, m) => sum + weights[m.type], 0) / mine.length)
}

function accuracyColor(acc: number | null) {
  if (acc === null) return 'text-muted'
  if (acc >= 85) return 'text-green-400'
  if (acc >= 65) return 'text-amber-400'
  return 'text-red-400'
}

export function AICoach() {
  const { coachMessage, moveHistory, isAIThinking, chess, playerColor, liveWhiteAccuracy, liveBlackAccuracy } = useGameStore()
  const [isExpanded,       setIsExpanded]      = useState(false)
  const [fullAnalysis,     setFullAnalysis]     = useState<CoachAnalysis[]>([])
  const [isAnalyzing,      setIsAnalyzing]      = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [errorMsg,         setErrorMsg]         = useState<string | null>(null)
  const { analyzeGame } = useStockfish()

  const runFullAnalysis = useCallback(async () => {
    if (!moveHistory.length) return
    setIsAnalyzing(true)
    setIsExpanded(true)
    setAnalysisProgress(0)
    setFullAnalysis([])
    setErrorMsg(null)
    const pgn   = chess.pgn()
    const total = moveHistory.length
    try {
      const positions = await analyzeGame(pgn, setAnalysisProgress)
      const sfWorked  = positions.length >= total + 1 && positions.some(p => p.bestMove !== null)
      if (!sfWorked) { setErrorMsg('Engine analysis failed.'); setIsAnalyzing(false); return }
      const analyses: CoachAnalysis[] = []
      for (let i = 0; i < total; i++) {
        const move       = moveHistory[i]
        const evalBefore = positions[i]?.evaluation     ?? 0
        const evalAfter  = positions[i + 1]?.evaluation ?? 0
        const engineBest = positions[i]?.bestMove       ?? undefined
        const delta      = move.color === 'w' ? evalAfter - evalBefore : evalBefore - evalAfter
        const type       = annotateMove(evalBefore, evalAfter, move.color as 'w' | 'b')
        analyses.push({ type, color: move.color as 'w' | 'b', message: makeMessage(type, move.san, engineBest, delta), bestMove: type !== 'best' && type !== 'good' ? engineBest : undefined, evalDelta: delta })
      }
      setFullAnalysis(analyses)
    } catch (err) {
      setErrorMsg('Analysis failed. Please try again.')
    }
    setIsAnalyzing(false)
  }, [moveHistory, chess, analyzeGame])

  const myColor: 'w' | 'b' = playerColor === 'b' ? 'b' : 'w'

  // Use deep analysis accuracy when available, otherwise show live accuracy
  const whiteAccuracy = fullAnalysis.length ? calcAccuracy(fullAnalysis, 'w') : liveWhiteAccuracy
  const blackAccuracy = fullAnalysis.length ? calcAccuracy(fullAnalysis, 'b') : liveBlackAccuracy

  const blunders     = fullAnalysis.filter(a => a.color === myColor && a.type === 'blunder').length
  const mistakes     = fullAnalysis.filter(a => a.color === myColor && a.type === 'mistake').length
  const inaccuracies = fullAnalysis.filter(a => a.color === myColor && a.type === 'inaccuracy').length
  const lastMove     = moveHistory[moveHistory.length - 1]
  const config       = lastMove?.annotation ? ANNOTATION_CONFIG[lastMove.annotation.type] : null
  const notableMoves = fullAnalysis.filter(a => a.type !== 'best' && a.type !== 'good')

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
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
          <motion.div key={lastMove.san} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className={clsx('rounded-xl border p-3', config.bg)}>
            <div className="flex items-center gap-2 mb-1.5">
              <config.icon size={14} className={config.color} />
              <span className={clsx('text-xs font-semibold', config.color)}>{config.label}</span>
              <code className="text-xs bg-black/20 px-1.5 py-0.5 rounded font-mono ml-auto">{lastMove.san}</code>
            </div>
            <p className="text-xs text-text/80 leading-relaxed">{coachMessage}</p>
          </motion.div>
        ) : (
          <motion.div key="default" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-surface2 p-3">
            <p className="text-xs text-muted leading-relaxed">{coachMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live accuracy — always visible once moves have been played */}
      {(whiteAccuracy !== null || blackAccuracy !== null) && (
        <div className="grid grid-cols-2 gap-2">
          {([['♔ White', whiteAccuracy], ['♚ Black', blackAccuracy]] as const).map(([label, acc]) => (
            <div key={label} className="rounded-lg bg-surface2 p-2 text-center">
              <motion.div
                key={acc}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={clsx('text-base font-bold font-mono', accuracyColor(acc))}
              >
                {acc !== null ? `${acc}%` : '—'}
              </motion.div>
              <div className="text-[9px] text-muted mt-0.5">
                {label} {!fullAnalysis.length && <span className="opacity-50">live</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Analysis section */}
      {moveHistory.length > 0 && (
        <div>
          <button
            onClick={() => fullAnalysis.length ? setIsExpanded(!isExpanded) : runFullAnalysis()}
            disabled={isAnalyzing}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border hover:border-border2 hover:bg-surface2 transition-all text-xs text-muted group"
          >
            <span className="group-hover:text-text transition-colors">
              {isAnalyzing ? `Analyzing... ${analysisProgress}%` : fullAnalysis.length ? 'Game Analysis' : 'Analyze Full Game'}
            </span>
            {isAnalyzing
              ? <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              : isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
            }
          </button>

          {isAnalyzing && (
            <div className="mt-1 h-1 rounded-full bg-surface2 overflow-hidden">
              <motion.div className="h-full bg-accent rounded-full" animate={{ width: `${analysisProgress}%` }} transition={{ duration: 0.3 }} />
            </div>
          )}

          {errorMsg && <p className="mt-2 text-xs text-red-400 text-center px-2">{errorMsg}</p>}

          <AnimatePresence>
            {isExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">

                {/* Error counts + move list — only after full analysis */}
                {fullAnalysis.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      <div className="rounded-lg bg-surface2 p-2 text-center">
                        <div className="text-base font-bold font-mono text-yellow-400">{inaccuracies}</div>
                        <div className="text-[9px] text-muted mt-0.5">?! Inaccuracy</div>
                      </div>
                      <div className="rounded-lg bg-surface2 p-2 text-center">
                        <div className="text-base font-bold font-mono text-orange-400">{mistakes}</div>
                        <div className="text-[9px] text-muted mt-0.5">? Mistake</div>
                      </div>
                      <div className="rounded-lg bg-surface2 p-2 text-center">
                        <div className="text-base font-bold font-mono text-red-400">{blunders}</div>
                        <div className="text-[9px] text-muted mt-0.5">?? Blunder</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-1 max-h-60 overflow-y-auto">
                      {notableMoves.length === 0 ? (
                        <div className="text-center py-4 text-xs text-green-400">✨ Clean game! No inaccuracies or mistakes found.</div>
                      ) : (
                        fullAnalysis.map((a, i) => {
                          if (a.type === 'best' || a.type === 'good') return null
                          const move = moveHistory[i]
                          if (!move) return null
                          const cfg = ANNOTATION_CONFIG[a.type]
                          return (
                            <div key={i} className={clsx('rounded-lg p-2 border text-xs', cfg.bg)}>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-muted font-mono">{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '...'}</span>
                                <code className={clsx('font-mono font-medium', cfg.color)}>{move.san}</code>
                                {a.evalDelta !== undefined && (
                                  <span className="text-[9px] text-muted ml-1">({a.evalDelta > 0 ? '+' : ''}{a.evalDelta.toFixed(2)})</span>
                                )}
                                <span className={clsx('ml-auto text-[10px] font-medium', cfg.color)}>{cfg.label}</span>
                              </div>
                              <p className="text-text/70 leading-relaxed">{a.message}</p>
                              {a.bestMove && (
                                <div className="mt-1 text-[10px]">
                                  <span className="text-muted">Better: </span>
                                  <code className="text-amber-400 font-mono">{a.bestMove}</code>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
