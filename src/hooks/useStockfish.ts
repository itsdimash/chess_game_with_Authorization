// src/hooks/useStockfish.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/gameStore'

interface StockfishAnalysis {
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
  1: [1, 0, 200],   // Easy: very shallow, skill 0, fast
  2: [3, 5, 400],   // Medium-easy
  3: [5, 10, 600],  // Medium
  4: [8, 15, 1000], // Hard
  5: [15, 20, 2000], // Expert (Stockfish full strength)
}

export function useStockfish({ depth = 15, onAnalysis }: UseStockfishOptions = {}) {
  const engineRef = useRef<Worker | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null)
  const analysisBuffer = useRef<Partial<StockfishAnalysis>>({})
  const { setEvalScore, setAIThinking, setCoachMessage, makeMove, difficulty } = useGameStore()

  // Initialize Stockfish worker
  useEffect(() => {
    const initEngine = async () => {
      try {
        // Use Stockfish WASM via CDN or local file
        // In production: serve from /public/stockfish.js
        const worker = new Worker('/stockfish/stockfish.js')

        worker.onmessage = (e: MessageEvent) => {
          const line: string = typeof e.data === 'string' ? e.data : e.data.toString()
          handleEngineOutput(line)
        }

        worker.onerror = (err) => {
          console.error('Stockfish error:', err)
        }

        engineRef.current = worker

        // Initialize
        worker.postMessage('uci')
        worker.postMessage('isready')
      } catch (err) {
        console.warn('Stockfish WASM not available, using fallback:', err)
        setIsReady(true) // Continue without engine
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
        // Parse depth
        const depthMatch = line.match(/depth (\d+)/)
        if (depthMatch) analysisBuffer.current.depth = parseInt(depthMatch[1])

        // Parse score
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

        // Parse principal variation
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

  // Analyze a position
  const analyzePosition = useCallback(
    (fen: string, searchDepth = depth) => {
      if (!isReady || !engineRef.current) return

      sendCommand('stop')
      sendCommand(`position fen ${fen}`)
      sendCommand(`go depth ${searchDepth}`)
    },
    [isReady, depth, sendCommand]
  )

  // Get best move for AI to play
  const getBestMove = useCallback(
    (fen: string) => {
      if (!isReady || !engineRef.current) {
        // Fallback: make a random legal move
        return
      }

      const [depthVal, skillLevel, moveTime] = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG[3]

      setAIThinking(true)
      sendCommand('stop')
      sendCommand(`setoption name Skill Level value ${skillLevel}`)
      sendCommand(`position fen ${fen}`)
      sendCommand(`go depth ${depthVal} movetime ${moveTime}`)
    },
    [isReady, difficulty, sendCommand, setAIThinking]
  )

  // Full game analysis (post-game)
  const analyzeGame = useCallback(
    async (pgn: string): Promise<StockfishAnalysis[]> => {
      if (!isReady || !engineRef.current) return []

      // Parse moves and analyze each position
      const { Chess } = await import('chess.js')
      const chess = new Chess()
      chess.loadPgn(pgn)
      const positions: string[] = []
      
      const tempChess = new Chess()
      const moves = chess.history()
      positions.push(tempChess.fen())
      for (const move of moves) {
        tempChess.move(move)
        positions.push(tempChess.fen())
      }

      // Analyze each position at depth 12
      const analyses: StockfishAnalysis[] = []
      for (const fen of positions) {
        const result = await new Promise<StockfishAnalysis>((resolve) => {
          const buffer: Partial<StockfishAnalysis> = {}
          const handler = (e: MessageEvent) => {
            const line: string = e.data
            if (line.startsWith('info')) {
              const scoreMatch = line.match(/score cp (-?\d+)/)
              if (scoreMatch) buffer.evaluation = parseInt(scoreMatch[1]) / 100
              const pvMatch = line.match(/pv (.+)$/)
              if (pvMatch) { buffer.pv = pvMatch[1].split(' '); buffer.bestMove = buffer.pv[0] }
            }
            if (line.startsWith('bestmove')) {
              const bestMove = line.split(' ')[1]
              engineRef.current?.removeEventListener('message', handler)
              resolve({
                bestMove: bestMove || null,
                evaluation: buffer.evaluation ?? 0,
                depth: 12,
                pv: buffer.pv ?? [],
                mate: null,
              })
            }
          }
          engineRef.current?.addEventListener('message', handler)
          sendCommand(`position fen ${fen}`)
          sendCommand('go depth 12')
        })
        analyses.push(result)
      }

      return analyses
    },
    [isReady, sendCommand]
  )

  // Auto-play AI move when it's the engine's turn
  const playAIMove = useCallback(
    (fen: string, onMove: (from: string, to: string, promo?: string) => void) => {
      if (!isReady) {
        // Fallback to random move
        setTimeout(() => {
          const { Chess } = require('chess.js') // eslint-disable-line
          const chess = new Chess(fen)
          const moves = chess.moves({ verbose: true })
          if (moves.length) {
            const move = moves[Math.floor(Math.random() * moves.length)]
            onMove(move.from, move.to, move.promotion)
          }
        }, 500)
        return
      }

      const moveHandler = (analysis: StockfishAnalysis) => {
        if (analysis.bestMove) {
          const from = analysis.bestMove.slice(0, 2)
          const to = analysis.bestMove.slice(2, 4)
          const promo = analysis.bestMove.length === 5 ? analysis.bestMove[4] : undefined
          setTimeout(() => onMove(from, to, promo), 100)
        }
      }

      // Temporarily override handler
      const [depthVal, skillLevel, moveTime] = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG[3]
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
