// src/hooks/useStockfish.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/gameStore'

export interface StockfishAnalysis {
  bestMove: string | null
  evaluation: number
  depth: number
  pv: string[]
  mate: number | null
}

interface UseStockfishOptions {
  depth?: number
  onAnalysis?: (analysis: StockfishAnalysis) => void
}

/**
 * Difficulty config: [depth, skillLevel, moveTimeMs, eloRating, limitStrength]
 *
 * Levels 1–3 use UCI_LimitStrength + UCI_Elo — this is the correct way to make
 * Stockfish play genuinely weaker (it will blunder, miss tactics, etc.).
 * Levels 4–5 disable ELO limiting and use raw Skill Level + higher depth.
 *
 * Elo estimates:
 *   1 → ~600  (complete beginner)
 *   2 → ~1000 (casual player)
 *   3 → ~1400 (intermediate)
 *   4 → ~1900 (strong club player)
 *   5 → ~2800 (near engine strength)
 */
const DIFFICULTY_CONFIG: Record<
  number,
  { depth: number; skill: number; moveTime: number; elo: number; limitStrength: boolean }
> = {
  1: { depth: 1,  skill: 0,  moveTime: 500,  elo: 600,  limitStrength: true  },
  2: { depth: 3,  skill: 5,  moveTime: 800,  elo: 1000, limitStrength: true  },
  3: { depth: 6,  skill: 10, moveTime: 1200, elo: 1400, limitStrength: true  },
  4: { depth: 12, skill: 17, moveTime: 2000, elo: 1900, limitStrength: false },
  5: { depth: 20, skill: 20, moveTime: 3000, elo: 2800, limitStrength: false },
}

export function useStockfish({ depth = 15, onAnalysis }: UseStockfishOptions = {}) {
  const engineRef      = useRef<Worker | null>(null)
  const pendingRef     = useRef<((a: StockfishAnalysis) => void) | null>(null)
  const bufferRef      = useRef<Partial<StockfishAnalysis>>({})
  const isReadyRef     = useRef(false)
  const lastDiffRef    = useRef<number>(-1)   // track last configured difficulty

  const [isReady, setIsReady]   = useState(false)
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null)

  const { setEvalScore, setAIThinking, difficulty } = useGameStore()

  useEffect(() => {
    let worker: Worker
    try {
      worker = new Worker('/stockfish/stockfish.js')
    } catch {
      console.warn('Stockfish not available')
      setIsReady(true)
      isReadyRef.current = true
      return
    }

    worker.onerror = (e) => console.error('Stockfish worker error:', e)

    worker.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === 'string' ? e.data : String(e.data)

      if (line === 'readyok') {
        setIsReady(true)
        isReadyRef.current = true
        return
      }

      if (line.startsWith('info')) {
        const cpMatch   = line.match(/score cp (-?\d+)/)
        const mateMatch = line.match(/score mate (-?\d+)/)
        const pvMatch   = line.match(/ pv (.+)$/)
        const dMatch    = line.match(/depth (\d+)/)

        if (cpMatch) {
          const val = parseInt(cpMatch[1]) / 100
          bufferRef.current.evaluation = val
          if (!pendingRef.current) setEvalScore(val)
        }
        if (mateMatch) {
          const m = parseInt(mateMatch[1])
          bufferRef.current.mate = m
          bufferRef.current.evaluation = m > 0 ? 100 : -100
          if (!pendingRef.current) setEvalScore(bufferRef.current.evaluation)
        }
        if (pvMatch) {
          bufferRef.current.pv       = pvMatch[1].split(' ')
          bufferRef.current.bestMove = bufferRef.current.pv[0]
        }
        if (dMatch) bufferRef.current.depth = parseInt(dMatch[1])
        return
      }

      if (line.startsWith('bestmove')) {
        const bm = line.split(' ')[1]
        const result: StockfishAnalysis = {
          bestMove:   bm && bm !== '(none)' ? bm : null,
          evaluation: bufferRef.current.evaluation ?? 0,
          depth:      bufferRef.current.depth      ?? 0,
          pv:         bufferRef.current.pv         ?? [],
          mate:       bufferRef.current.mate       ?? null,
        }
        bufferRef.current = {}
        setAnalysis(result)
        setAIThinking(false)
        onAnalysis?.(result)

        if (pendingRef.current) {
          const resolve = pendingRef.current
          pendingRef.current = null
          resolve(result)
        }
      }
    }

    engineRef.current = worker
    worker.postMessage('uci')
    worker.postMessage('setoption name Hash value 128')
    worker.postMessage('setoption name Threads value 1')
    worker.postMessage('isready')

    return () => worker.terminate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = useCallback((cmd: string) => {
    engineRef.current?.postMessage(cmd)
  }, [])

  /** Apply engine options for the given difficulty level (only when it changes). */
  const applyDifficultyOptions = useCallback(
    (diff: number) => {
      if (diff === lastDiffRef.current) return
      lastDiffRef.current = diff

      const cfg = DIFFICULTY_CONFIG[diff] ?? DIFFICULTY_CONFIG[3]

      send('stop')
      send(`setoption name Skill Level value ${cfg.skill}`)

      if (cfg.limitStrength) {
        send('setoption name UCI_LimitStrength value true')
        send(`setoption name UCI_Elo value ${cfg.elo}`)
      } else {
        send('setoption name UCI_LimitStrength value false')
      }

      send('isready')
    },
    [send]
  )

  const analyzePosition = useCallback(
    (fen: string, searchDepth = depth) => {
      if (!isReadyRef.current || !engineRef.current) return
      if (pendingRef.current) return
      bufferRef.current = {}
      send('stop')
      send(`position fen ${fen}`)
      send(`go depth ${searchDepth}`)
    },
    [depth, send]
  )

  const playAIMove = useCallback(
    (fen: string, onMove: (from: string, to: string, promo?: string) => void) => {
      // Fallback: random move if Stockfish unavailable
      if (!isReadyRef.current || !engineRef.current) {
        import('chess.js').then(({ Chess }) => {
          const c = new Chess(fen)
          const moves = c.moves({ verbose: true })
          if (moves.length) {
            const m = moves[Math.floor(Math.random() * moves.length)]
            setTimeout(() => onMove(m.from, m.to, m.promotion), 500)
          }
        })
        return
      }

      const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG[3]

      // Apply difficulty settings (no-op if already set)
      applyDifficultyOptions(difficulty)

      setAIThinking(true)
      bufferRef.current  = {}
      pendingRef.current = (result) => {
        if (result.bestMove) {
          const from  = result.bestMove.slice(0, 2)
          const to    = result.bestMove.slice(2, 4)
          const promo = result.bestMove.length === 5 ? result.bestMove[4] : undefined

          // Small human-like delay — shorter for easier levels, longer for harder
          const delay = cfg.limitStrength ? 250 : 150
          setTimeout(() => onMove(from, to, promo), delay)
        } else {
          setAIThinking(false)
        }
      }

      send('stop')
      send(`position fen ${fen}`)
      // Use both depth limit AND movetime so harder levels feel more deliberate
      send(`go depth ${cfg.depth} movetime ${cfg.moveTime}`)
    },
    [difficulty, send, setAIThinking, applyDifficultyOptions]
  )

  /** Analyze each position at depth 8, movetime 300 ms — fast but accurate enough. */
  const analyzeGame = useCallback(
    async (
      pgn: string,
      onProgress?: (pct: number) => void
    ): Promise<StockfishAnalysis[]> => {
      // Wait for engine ready (up to 8 s)
      if (!isReadyRef.current) {
        await new Promise<void>((res) => {
          const start = Date.now()
          const iv = setInterval(() => {
            if (isReadyRef.current || Date.now() - start > 8000) {
              clearInterval(iv); res()
            }
          }, 100)
        })
      }

      if (!engineRef.current) return []

      const { Chess } = await import('chess.js')
      const chess = new Chess()
      try { chess.loadPgn(pgn) } catch { return [] }

      // Build FEN list: start + after each move
      const fens: string[] = []
      const tmp = new Chess()
      fens.push(tmp.fen())
      for (const mv of chess.history()) {
        tmp.move(mv)
        fens.push(tmp.fen())
      }

      if (fens.length < 2) return []

      // Disable strength limiting during analysis so evals are accurate
      send('stop')
      send('setoption name UCI_LimitStrength value false')
      send('setoption name Skill Level value 20')
      await new Promise(r => setTimeout(r, 150))
      pendingRef.current = null
      bufferRef.current  = {}
      lastDiffRef.current = -1  // force re-apply after analysis

      const results: StockfishAnalysis[] = []

      for (let i = 0; i < fens.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        const result = await new Promise<StockfishAnalysis>((resolve) => {
          bufferRef.current = {}

          // 1.5 s hard timeout per position
          const timer = setTimeout(() => {
            if (pendingRef.current) {
              pendingRef.current = null
              resolve({
                bestMove:   bufferRef.current.bestMove   ?? null,
                evaluation: bufferRef.current.evaluation ?? 0,
                depth:      bufferRef.current.depth      ?? 0,
                pv:         bufferRef.current.pv         ?? [],
                mate:       bufferRef.current.mate       ?? null,
              })
            }
          }, 1500)

          pendingRef.current = (r) => {
            clearTimeout(timer)
            resolve(r)
          }

          send(`position fen ${fens[i]}`)
          send('go depth 8 movetime 300')
        })

        results.push(result)
        onProgress?.(Math.round(((i + 1) / fens.length) * 100))
      }

      // Resume live eval
      bufferRef.current = {}
      send(`position fen ${fens[fens.length - 1]}`)
      send(`go depth ${depth}`)

      return results
    },
    [send, depth]
  )

  return {
    isReady,
    analysis,
    analyzePosition,
    analyzeGame,
    playAIMove,
    sendCommand: send,
  }
}
