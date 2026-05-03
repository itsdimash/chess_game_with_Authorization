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

// Difficulty settings: [depth, skillLevel, moveTime]
const DIFFICULTY_CONFIG: Record<number, [number, number, number]> = {
  1: [1, 0, 200],
  2: [3, 5, 400],
  3: [5, 10, 600],
  4: [8, 15, 1000],
  5: [15, 20, 2000],
}

export function useStockfish({ depth = 15, onAnalysis }: UseStockfishOptions = {}) {
  const engineRef = useRef<Worker | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null)
  const analysisBuffer = useRef<Partial<StockfishAnalysis>>({})
  const { setEvalScore, setAIThinking, difficulty } = useGameStore()

  useEffect(() => {
    const initEngine = async () => {
      try {
        const worker = new Worker('/stockfish/stockfish.js')

        worker.onmessage = (e: MessageEvent) => {
          const line: string = typeof e.data === 'string' ? e.data : e.data.toString()
          handleEngineOutput(line)
        }

        worker.onerror = (err) => {
          console.error('Stockfish error:', err)
        }

        engineRef.current = worker
        worker.postMessage('uci')
        worker.postMessage('isready')
      } catch (err) {
        console.warn('Stockfish WASM not available, using fallback:', err)
        setIsReady(true)
      }
    }

    initEngine()
    return () => {
      engineRef.current?.terminate()
    }
  }, [])

  const handleEngineOutput = useCallback(
    (line: string) => {
      if (line === 'readyok') {
        setIsReady(true)
        return
      }

      if (line.startsWith('info')) {
        const depthMatch = line.match(/depth (\d+)/)
        if (depthMatch) analysisBuffer.current.depth = parseInt(depthMatch[1])

        const scoreMatch = line.match(/score cp (-?\d+)/)
        const mateMatch = line.match(/score mate (-?\d+)/)

        if (scoreMatch) {
          const cp = parseInt(scoreMatch[1])
          analysisBuffer.current.evaluation = cp / 100
          setEvalScore(cp / 100)
        }
        if (mateMatch) {
          analysisBuffer.current.mate = parseInt(mateMatch[1])
          analysisBuffer.current.evaluation = mateMatch[1].startsWith('-') ? -100 : 100
        }

        const pvMatch = line.match(/pv (.+)$/)
        if (pvMatch) {
          analysisBuffer.current.pv = pvMatch[1].split(' ')
        }
      }

      if (line.startsWith('bestmove')) {
        const parts = line.split(' ')
        const bestMove = parts[1]

        if (bestMove && bestMove !== '(none)') {
          const finalAnalysis: StockfishAnalysis = {
            bestMove,
            evaluation: analysisBuffer.current.evaluation ?? 0,
            depth: analysisBuffer.current.depth ?? 0,
            pv: analysisBuffer.current.pv ?? [],
            mate: analysisBuffer.current.mate ?? null,
          }

          setAnalysis(finalAnalysis)
          onAnalysis?.(finalAnalysis)
          analysisBuffer.current = {}
        }

        setAIThinking(false)
      }
    },
    [setEvalScore, setAIThinking, onAnalysis]
  )

  const sendCommand = useCallback((cmd: string) => {
    engineRef.current?.postMessage(cmd)
  }, [])

  const analyzePosition = useCallback(
    (fen: string, searchDepth = depth) => {
      if (!isReady || !engineRef.current) return
      sendCommand('stop')
      sendCommand(`position fen ${fen}`)
      sendCommand(`go depth ${searchDepth}`)
    },
    [isReady, depth, sendCommand]
  )

  const getBestMove = useCallback(
    (fen: string) => {
      if (!isReady || !engineRef.current) return
      const [depthVal, skillLevel, moveTime] = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG[3]
      setAIThinking(true)
      sendCommand('stop')
      sendCommand(`setoption name Skill Level value ${skillLevel}`)
      sendCommand(`position fen ${fen}`)
      sendCommand(`go depth ${depthVal} movetime ${moveTime}`)
    },
    [isReady, difficulty, sendCommand, setAIThinking]
  )

  // ✅ FIXED: analyzeGame now uses onmessage (not addEventListener) on the Worker
  // and correctly resolves each position before moving to the next.
  const analyzeGame = useCallback(
    async (pgn: string): Promise<StockfishAnalysis[]> => {
      if (!isReady || !engineRef.current) return []

      const { Chess } = await import('chess.js')
      const chess = new Chess()
      chess.loadPgn(pgn)

      // Build list of FENs: one per position (before each move + final)
      const positions: string[] = []
      const tempChess = new Chess()
      positions.push(tempChess.fen())
      for (const move of chess.history()) {
        tempChess.move(move)
        positions.push(tempChess.fen())
      }

      const analyses: StockfishAnalysis[] = []

      for (const fen of positions) {
        const result = await new Promise<StockfishAnalysis>((resolve) => {
          const buffer: Partial<StockfishAnalysis> = {}

          // ✅ KEY FIX: save and restore onmessage instead of addEventListener
          const previousHandler = engineRef.current!.onmessage

          engineRef.current!.onmessage = (e: MessageEvent) => {
            const line: string = typeof e.data === 'string' ? e.data : e.data.toString()

            if (line.startsWith('info')) {
              const scoreMatch = line.match(/score cp (-?\d+)/)
              const mateMatch = line.match(/score mate (-?\d+)/)
              if (scoreMatch) buffer.evaluation = parseInt(scoreMatch[1]) / 100
              if (mateMatch) {
                buffer.mate = parseInt(mateMatch[1])
                buffer.evaluation = mateMatch[1].startsWith('-') ? -100 : 100
              }
              const pvMatch = line.match(/pv (.+)$/)
              if (pvMatch) {
                buffer.pv = pvMatch[1].split(' ')
                buffer.bestMove = buffer.pv[0]
              }
              const depthMatch = line.match(/depth (\d+)/)
              if (depthMatch) buffer.depth = parseInt(depthMatch[1])
            }

            if (line.startsWith('bestmove')) {
              // Restore main handler before resolving
              engineRef.current!.onmessage = previousHandler as (e: MessageEvent) => void

              const bestMove = line.split(' ')[1]
              resolve({
                bestMove: bestMove && bestMove !== '(none)' ? bestMove : null,
                evaluation: buffer.evaluation ?? 0,
                depth: buffer.depth ?? 12,
                pv: buffer.pv ?? [],
                mate: buffer.mate ?? null,
              })
            }
          }

          sendCommand(`position fen ${fen}`)
          sendCommand('go depth 12')
        })

        analyses.push(result)
      }

      return analyses
    },
    [isReady, sendCommand]
  )

  const playAIMove = useCallback(
    (fen: string, onMove: (from: string, to: string, promo?: string) => void) => {
      if (!isReady) {
        setTimeout(async () => {
          const { Chess } = await import('chess.js')
          const chess = new Chess(fen)
          const moves = chess.moves({ verbose: true })
          if (moves.length) {
            const move = moves[Math.floor(Math.random() * moves.length)]
            onMove(move.from, move.to, move.promotion)
          }
        }, 500)
        return
      }

      const [depthVal, skillLevel, moveTime] = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG[3]
      const previousHandler = engineRef.current!.onmessage

      engineRef.current!.onmessage = (e: MessageEvent) => {
        const line: string = typeof e.data === 'string' ? e.data : e.data.toString()

        if (line.startsWith('bestmove')) {
          engineRef.current!.onmessage = previousHandler as (e: MessageEvent) => void
          setAIThinking(false)

          const bestMove = line.split(' ')[1]
          if (bestMove && bestMove !== '(none)') {
            const from = bestMove.slice(0, 2)
            const to = bestMove.slice(2, 4)
            const promo = bestMove.length === 5 ? bestMove[4] : undefined
            setTimeout(() => onMove(from, to, promo), 100)
          }
        }
      }

      setAIThinking(true)
      sendCommand('stop')
      sendCommand(`setoption name Skill Level value ${skillLevel}`)
      sendCommand(`position fen ${fen}`)
      sendCommand(`go depth ${depthVal} movetime ${moveTime}`)
    },
    [isReady, difficulty, sendCommand, setAIThinking]
  )

  return {
    isReady,
    analysis,
    analyzePosition,
    getBestMove,
    analyzeGame,
    playAIMove,
    sendCommand,
  }
}
