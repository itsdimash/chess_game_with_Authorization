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

const DIFFICULTY_CONFIG: Record<number, [number, number, number]> = {
  1: [1,  0,  200],
  2: [3,  5,  400],
  3: [5,  10, 600],
  4: [8,  15, 1000],
  5: [15, 20, 2000],
}

export function useStockfish({ depth = 15, onAnalysis }: UseStockfishOptions = {}) {
  const engineRef  = useRef<Worker | null>(null)
  const pendingRef = useRef<((a: StockfishAnalysis) => void) | null>(null)
  const bufferRef  = useRef<Partial<StockfishAnalysis>>({})
  const isReadyRef = useRef(false)

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

        // Resolve the pending promise and clear it BEFORE calling resolve
        // so that the next iteration can set a new pendingRef immediately
        if (pendingRef.current) {
          const resolve = pendingRef.current
          pendingRef.current = null
          resolve(result)
        }
      }
    }

    engineRef.current = worker
    worker.postMessage('uci')
    worker.postMessage('isready')
    return () => worker.terminate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = useCallback((cmd: string) => {
    engineRef.current?.postMessage(cmd)
  }, [])

  const analyzePosition = useCallback(
    (fen: string, searchDepth = depth) => {
      if (!isReadyRef.current || !engineRef.current) return
      if (pendingRef.current) return // batch analysis in progress, don't interrupt
      bufferRef.current = {}
      send('stop')
      send(`position fen ${fen}`)
      send(`go depth ${searchDepth}`)
    },
    [depth, send]
  )

  const playAIMove = useCallback(
    (fen: string, onMove: (from: string, to: string, promo?: string) => void) => {
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

      const [depthVal, skillLevel, moveTime] =
        DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG[3]

      setAIThinking(true)
      bufferRef.current  = {}
      pendingRef.current = (result) => {
        if (result.bestMove) {
          const from  = result.bestMove.slice(0, 2)
          const to    = result.bestMove.slice(2, 4)
          const promo = result.bestMove.length === 5 ? result.bestMove[4] : undefined
          setTimeout(() => onMove(from, to, promo), 100)
        }
      }

      send('stop')
      send(`setoption name Skill Level value ${skillLevel}`)
      send(`position fen ${fen}`)
      send(`go depth ${depthVal} movetime ${moveTime}`)
    },
    [difficulty, send, setAIThinking]
  )

  const analyzeGame = useCallback(
    async (
      pgn: string,
      onProgress?: (pct: number) => void
    ): Promise<StockfishAnalysis[]> => {
      // Wait for engine ready (up to 8s)
      if (!isReadyRef.current) {
        await new Promise<void>((res) => {
          const start = Date.now()
          const check = setInterval(() => {
            if (isReadyRef.current || Date.now() - start > 8000) {
              clearInterval(check)
              res()
            }
          }, 100)
        })
      }

      if (!engineRef.current) return []

      const { Chess } = await import('chess.js')
      const chess = new Chess()
      try { chess.loadPgn(pgn) } catch { return [] }

      // Build FEN list
      const fens: string[] = []
      const tmp = new Chess()
      fens.push(tmp.fen())
      for (const mv of chess.history()) {
        tmp.move(mv)
        fens.push(tmp.fen())
      }

      if (fens.length < 2) return []

      // Stop live analysis and wait for the "bestmove" response to flush
      send('stop')
      await new Promise(r => setTimeout(r, 300))
      pendingRef.current = null
      bufferRef.current  = {}

      const results: StockfishAnalysis[] = []

      for (let i = 0; i < fens.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        const result = await new Promise<StockfishAnalysis>((resolve) => {
          bufferRef.current = {}

          // 4-second safety timeout per position
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
          }, 4000)

          pendingRef.current = (r) => {
            clearTimeout(timer)
            resolve(r)
          }

          send(`position fen ${fens[i]}`)
          send('go depth 12 movetime 1500')
        })

        results.push(result)
        onProgress?.(Math.round(((i + 1) / fens.length) * 100))
      }

      // Resume live eval on current position
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
