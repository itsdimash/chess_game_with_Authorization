'use client'
// src/components/game/AICoach.tsx

import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Zap } from 'lucide-react'
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
  best:       { icon: Sparkles,      color: '#c8a96e', bg: 'rgba(200,169,110,0.08)', border: 'rgba(200,169,110,0.2)',  label: 'Best Move' },
  good:       { icon: CheckCircle,   color: '#4a9060', bg: 'rgba(74,144,96,0.08)',   border: 'rgba(74,144,96,0.2)',    label: 'Good Move' },
  inaccuracy: { icon: AlertTriangle, color: '#c8a030', bg: 'rgba(200,160,48,0.08)',  border: 'rgba(200,160,48,0.2)',   label: 'Inaccuracy ?!' },
  mistake:    { icon: AlertTriangle, color: '#c07030', bg: 'rgba(192,112,48,0.08)',  border: 'rgba(192,112,48,0.2)',   label: 'Mistake ?' },
  blunder:    { icon: XCircle,       color: '#c0503a', bg: 'rgba(192,80,58,0.08)',   border: 'rgba(192,80,58,0.2)',    label: 'Blunder ??' },
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
  const loss = delta !== undefined ? Math.abs(delta).toFixed(2) : ''
  const better = bestMove ? ` Consider ${bestMove} instead.` : ''
  const pool: Record<MoveAnnotation['type'], string[]> = {
    best:       [`${san} is the engine's choice — flawless.`, `Precisely right. ${san} is the strongest continuation.`],
    good:       [`${san} is solid — well played.`, `A fine move. ${san} keeps the balance.`],
    inaccuracy: [`${san} loses a touch of advantage (−${loss}).${better}`, `Small imprecision with ${san}.${better}`],
    mistake:    [`${san} concedes ground (−${loss} pawns).${better}`, `${san} weakens your position.${better}`],
    blunder:    [`${san} throws away material! (−${loss} pawns).${better}`, `A serious error — ${san} costs you dearly.${better}`],
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

function accuracyColor(acc: number | null): string {
  if (acc === null) return 'var(--muted)'
  if (acc >= 85) return '#4a9060'
  if (acc >= 65) return '#c8a96e'
  return '#c0503a'
}

export function AICoach() {
  const { coachMessage, moveHistory, isAIThinking, chess, playerColor, liveWhiteAccuracy, liveBlackAccuracy } = useGameStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [fullAnalysis, setFullAnalysis] = useState<CoachAnalysis[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { analyzeGame } = useStockfish()

  const runFullAnalysis = useCallback(async () => {
    if (!moveHistory.length) return
    setIsAnalyzing(true)
    setIsExpanded(true)
    setAnalysisProgress(0)
    setFullAnalysis([])
    setErrorMsg(null)
    const pgn = chess.pgn()
    const total = moveHistory.length
    try {
      const positions = await analyzeGame(pgn, setAnalysisProgress)
      const sfWorked = positions.length >= total + 1 && positions.some(p => p.bestMove !== null)
      if (!sfWorked) { setErrorMsg('Engine analysis failed.'); setIsAnalyzing(false); return }
      const analyses: CoachAnalysis[] = []
      for (let i = 0; i < total; i++) {
        const move = moveHistory[i]
        const evalBefore = positions[i]?.evaluation ?? 0
        const evalAfter = positions[i + 1]?.evaluation ?? 0
        const engineBest = positions[i]?.bestMove ?? undefined
        const delta = move.color === 'w' ? evalAfter - evalBefore : evalBefore - evalAfter
        const type = annotateMove(evalBefore, evalAfter, move.color as 'w' | 'b')
        analyses.push({ type, color: move.color as 'w' | 'b', message: makeMessage(type, move.san, engineBest, delta), bestMove: type !== 'best' && type !== 'good' ? engineBest : undefined, evalDelta: delta })
      }
      setFullAnalysis(analyses)
    } catch {
      setErrorMsg('Analysis failed. Please try again.')
    }
    setIsAnalyzing(false)
  }, [moveHistory, chess, analyzeGame])

  const myColor: 'w' | 'b' = playerColor === 'b' ? 'b' : 'w'
  const whiteAccuracy = fullAnalysis.length ? calcAccuracy(fullAnalysis, 'w') : liveWhiteAccuracy
  const blackAccuracy = fullAnalysis.length ? calcAccuracy(fullAnalysis, 'b') : liveBlackAccuracy
  const blunders = fullAnalysis.filter(a => a.color === myColor && a.type === 'blunder').length
  const mistakes = fullAnalysis.filter(a => a.color === myColor && a.type === 'mistake').length
  const inaccuracies = fullAnalysis.filter(a => a.color === myColor && a.type === 'inaccuracy').length
  const lastMove = moveHistory[moveHistory.length - 1]
  const notableMoves = fullAnalysis.filter(a => a.type !== 'best' && a.type !== 'good')

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] tracking-[0.2em] uppercase"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
            KnightOwl Coach
          </span>
        </div>
        {isAIThinking && (
          <div className="flex items-center gap-1.5">
            <div className="thinking-pulse flex gap-0.5">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1 h-1 rounded-full" style={{ background: 'var(--accent)', animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <span className="text-[10px] tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
              Thinking
            </span>
          </div>
        )}
      </div>

      {/* Current move annotation */}
      <AnimatePresence mode="wait">
        {lastMove ? (
          <motion.div
            key={lastMove.san}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="rounded-xl p-3"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
            }}
          >
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)', fontFamily: 'var(--font-body)' }}>
              {coachMessage}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl p-3"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
              {coachMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analysis trigger */}
      {moveHistory.length > 0 && (
        <div>
          <button
            onClick={() => fullAnalysis.length ? setIsExpanded(!isExpanded) : runFullAnalysis()}
            disabled={isAnalyzing}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.68rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
            onMouseEnter={e => {
              const t = e.currentTarget
              t.style.borderColor = 'var(--border2)'
              t.style.color = 'var(--text2)'
            }}
            onMouseLeave={e => {
              const t = e.currentTarget
              t.style.borderColor = 'var(--border)'
              t.style.color = 'var(--muted)'
            }}
          >
            <span>
              {isAnalyzing ? `Analysing ${analysisProgress}%` : fullAnalysis.length ? 'Game Analysis' : 'Analyse Game'}
            </span>
            {isAnalyzing
              ? <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              : isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />
            }
          </button>

          {isAnalyzing && (
            <div className="mt-1.5 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent2))' }}
                animate={{ width: `${analysisProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}

          {errorMsg && (
            <p className="mt-2 text-xs text-center" style={{ color: 'var(--danger)', fontFamily: 'var(--font-body)' }}>
              {errorMsg}
            </p>
          )}

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {fullAnalysis.length > 0 && (
                  <>
                    {/* Accuracy grid */}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {([['♔ White', whiteAccuracy], ['♚ Black', blackAccuracy]] as const).map(([label, acc]) => (
                        <div key={label} className="rounded-xl p-3 text-center"
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                          <motion.div
                            key={acc}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-xl font-bold tabular-nums"
                            style={{ color: accuracyColor(acc), fontFamily: 'var(--font-mono)' }}
                          >
                            {acc !== null ? `${acc}%` : '—'}
                          </motion.div>
                          <div className="text-[10px] mt-0.5 tracking-wide"
                            style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Error counts */}
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      {[
                        { count: inaccuracies, label: '?! Inaccuracy', color: '#c8a030' },
                        { count: mistakes,     label: '? Mistake',     color: '#c07030' },
                        { count: blunders,     label: '?? Blunder',    color: '#c0503a' },
                      ].map(({ count, label, color }) => (
                        <div key={label} className="rounded-xl p-2 text-center"
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                          <div className="text-base font-bold tabular-nums" style={{ color, fontFamily: 'var(--font-mono)' }}>{count}</div>
                          <div className="text-[9px] mt-0.5 tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Move list */}
                    <div className="mt-3 flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                      {notableMoves.length === 0 ? (
                        <div className="text-center py-5 text-sm" style={{ color: '#4a9060', fontFamily: 'var(--font-body)' }}>
                          ✦ Clean game — no serious errors found.
                        </div>
                      ) : (
                        fullAnalysis.map((a, i) => {
                          if (a.type === 'best' || a.type === 'good') return null
                          const move = moveHistory[i]
                          if (!move) return null
                          const cfg = ANNOTATION_CONFIG[a.type]
                          return (
                            <div key={i} className="rounded-xl p-2.5"
                              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                                  {Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '…'}
                                </span>
                                <code className="text-xs font-medium" style={{ color: cfg.color, fontFamily: 'var(--font-mono)' }}>
                                  {move.san}
                                </code>
                                {a.evalDelta !== undefined && (
                                  <span className="text-[9px]" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                                    ({a.evalDelta > 0 ? '+' : ''}{a.evalDelta.toFixed(2)})
                                  </span>
                                )}
                                <span className="ml-auto text-[10px] tracking-wide"
                                  style={{ color: cfg.color, fontFamily: 'var(--font-display)' }}>
                                  {cfg.label}
                                </span>
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)', fontFamily: 'var(--font-body)' }}>
                                {a.message}
                              </p>
                              {a.bestMove && (
                                <div className="mt-1.5 text-[10px]">
                                  <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>Better: </span>
                                  <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{a.bestMove}</code>
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

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
