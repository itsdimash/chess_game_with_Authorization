'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess, Square } from 'chess.js'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import { useGameStore } from '@/store/gameStore'
import { useStockfish } from '@/hooks/useStockfish'
import { PieceComponent } from './Piece'
import { EvalBar } from './EvalBar'
import { MoveHighlight } from './MoveHighlight'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

interface ChessBoardProps {
  flipped?: boolean
  interactive?: boolean
  showEvalBar?: boolean
  showCoordinates?: boolean
  onMove?: (from: Square, to: Square, promotion?: string) => void
  size?: number
  lightSquareColor?: string
  darkSquareColor?: string
}

export function ChessBoard({
  flipped,
  interactive = true,
  showEvalBar = true,
  showCoordinates = true,
  onMove,
  size = 560,
  lightSquareColor = '#f0d9b5',
  darkSquareColor = '#b58863',
}: ChessBoardProps) {
  const {
    chess,
    selectedSquare,
    legalMoves,
    lastMove,
    playerColor,
    status,
    selectSquare,
    clearSelection,
    makeMove,
  } = useGameStore()

  const { analyzePosition } = useStockfish()

  const isFlipped = flipped !== undefined ? flipped : playerColor === 'b'

  const [promotionSquare, setPromotionSquare] = useState<{
    from: Square
    to: Square
  } | null>(null)

  const [dragging, setDragging] = useState<Square | null>(null)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const boardRef = useRef<HTMLDivElement>(null)

  const squareSize = size / 8

  const getSquareName = useCallback(
    (row: number, col: number): Square => {
      const file = isFlipped ? FILES[7 - col] : FILES[col]
      const rank = isFlipped ? RANKS[7 - row] : RANKS[row]
      return `${file}${rank}` as Square
    },
    [isFlipped]
  )

  const getSquareCoords = useCallback(
    (square: Square) => {
      const file = FILES.indexOf(square[0])
      const rank = RANKS.indexOf(square[1])
      const col = isFlipped ? 7 - file : file
      const row = isFlipped ? 7 - rank : rank
      return { row, col }
    },
    [isFlipped]
  )

  // Central move handler — called by clicks, drag-drop, and promotion
  const handleMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const success = makeMove(from, to, promotion)
      if (success) {
        // Notify parent (e.g. page.tsx triggers AI move from here)
        onMove?.(from, to, promotion)
        // Give store a tick to update chess instance, then re-analyze
        setTimeout(() => {
          analyzePosition(chess.fen())
        }, 50)
      }
      return success
    },
    [makeMove, onMove, analyzePosition, chess]
  )

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!interactive) return
      const canMove =
        playerColor === 'both' || chess.turn() === playerColor

      if (!canMove) return

      if (selectedSquare) {
        const isLegal = legalMoves.includes(square)
        if (isLegal) {
          const piece = chess.get(selectedSquare)
          if (
            piece?.type === 'p' &&
            ((piece.color === 'w' && square[1] === '8') ||
              (piece.color === 'b' && square[1] === '1'))
          ) {
            setPromotionSquare({ from: selectedSquare, to: square })
            return
          }
          handleMove(selectedSquare, square)
          clearSelection()
        } else if (chess.get(square)?.color === chess.turn()) {
          selectSquare(square)
        } else {
          clearSelection()
        }
      } else {
        if (chess.get(square)?.color === chess.turn()) {
          selectSquare(square)
        }
      }
    },
    [interactive, playerColor, chess, selectedSquare, legalMoves, handleMove, clearSelection, selectSquare]
  )

  const handlePromotion = useCallback(
    (piece: string) => {
      if (promotionSquare) {
        handleMove(promotionSquare.from, promotionSquare.to, piece)
        setPromotionSquare(null)
        clearSelection()
      }
    },
    [promotionSquare, handleMove, clearSelection]
  )

  const handleDragStart = useCallback(
    (square: Square, e: React.MouseEvent) => {
      if (!interactive) return
      if (chess.get(square)?.color !== chess.turn()) return
      setDragging(square)
      setDragPos({ x: e.clientX, y: e.clientY })
      selectSquare(square)
    },
    [interactive, chess, selectSquare]
  )

  useEffect(() => {
    if (!dragging) return
    const handleMouseMove = (e: MouseEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY })
    }
    const handleMouseUp = (e: MouseEvent) => {
      if (boardRef.current && dragging) {
        const rect = boardRef.current.getBoundingClientRect()
        const col = Math.floor((e.clientX - rect.left) / squareSize)
        const row = Math.floor((e.clientY - rect.top) / squareSize)
        if (col >= 0 && col < 8 && row >= 0 && row < 8) {
          const targetSquare = getSquareName(row, col)
          handleSquareClick(targetSquare)
        }
      }
      setDragging(null)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, squareSize, getSquareName, handleSquareClick])

  const board = chess.board()
  const displayBoard = isFlipped
    ? [...board].reverse().map((row) => [...row].reverse())
    : board

  const isInCheck = chess.inCheck()
  const kingSquare = isInCheck ? findKingSquare(chess, chess.turn()) : null

  return (
    <div className="flex items-start gap-3">
      {showEvalBar && <EvalBar />}

      <div>
        <div className="flex">
          {showCoordinates && <div style={{ width: 20 }} />}
          <div style={{ width: size }} />
        </div>

        <div className="flex">
          {/* Rank labels */}
          {showCoordinates && (
            <div className="flex flex-col" style={{ width: 20, height: size }}>
              {(isFlipped ? [...RANKS].reverse() : RANKS).map((rank) => (
                <div
                  key={rank}
                  className="flex items-center justify-center text-xs text-muted font-mono"
                  style={{ height: squareSize }}
                >
                  {rank}
                </div>
              ))}
            </div>
          )}

          {/* Board */}
          <div
            ref={boardRef}
            className="relative rounded-sm overflow-hidden"
            style={{
              width: size,
              height: size,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 3px #2a2218',
            }}
          >
            <div className="grid grid-cols-8 w-full h-full">
              {displayBoard.map((row, rowIdx) =>
                row.map((piece, colIdx) => {
                  const square = getSquareName(rowIdx, colIdx)
                  const isLight = (rowIdx + colIdx) % 2 === 0
                  const isSelected = selectedSquare === square
                  const isLegal = legalMoves.includes(square)
                  const isLastMove =
                    lastMove &&
                    (lastMove.from === square || lastMove.to === square)
                  const isKingInCheck = kingSquare === square
                  const isOccupied = !!piece

                  return (
                    <div
                      key={square}
                      className={clsx(
                        'relative cursor-pointer select-none',
                        isSelected && 'brightness-110',
                        isKingInCheck && 'bg-red-500/60'
                      )}
                      style={{
                        width: squareSize,
                        height: squareSize,
                        backgroundColor: isKingInCheck
                          ? undefined
                          : isLight
                          ? lightSquareColor
                          : darkSquareColor,
                      }}
                      onClick={() => handleSquareClick(square)}
                    >
                      {isLastMove && (
                        <div className="absolute inset-0 bg-yellow-400/30 pointer-events-none" />
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-yellow-300/40 pointer-events-none" />
                      )}
                      {isLegal && !isOccupied && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div
                            className="rounded-full bg-black/20"
                            style={{
                              width: squareSize * 0.3,
                              height: squareSize * 0.3,
                            }}
                          />
                        </div>
                      )}
                      {isLegal && isOccupied && (
                        <div
                          className="absolute inset-0 rounded-full pointer-events-none"
                          style={{
                            boxShadow: `inset 0 0 0 ${squareSize * 0.08}px rgba(0,0,0,0.25)`,
                          }}
                        />
                      )}
                      {piece && piece.square !== dragging && (
                        <PieceComponent
                          piece={piece}
                          size={squareSize}
                          onMouseDown={(e) => handleDragStart(square, e)}
                          isDragging={dragging === square}
                        />
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Dragged piece overlay */}
            {dragging && chess.get(dragging) && (
              <div
                className="fixed pointer-events-none z-50"
                style={{
                  left: dragPos.x - squareSize / 2,
                  top: dragPos.y - squareSize / 2,
                  width: squareSize,
                  height: squareSize,
                }}
              >
                <PieceComponent
                  piece={{ ...chess.get(dragging)!, square: dragging }}
                  size={squareSize}
                  isDragging={true}
                />
              </div>
            )}

            {/* Promotion modal */}
            <AnimatePresence>
              {promotionSquare && (
                <PromotionModal
                  color={chess.turn()}
                  onSelect={handlePromotion}
                  onCancel={() => {
                    setPromotionSquare(null)
                    clearSelection()
                  }}
                  squareSize={squareSize}
                  square={promotionSquare.to}
                  flipped={isFlipped}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* File labels */}
        {showCoordinates && (
          <div className="flex" style={{ marginLeft: 20 }}>
            {(isFlipped ? [...FILES].reverse() : FILES).map((file) => (
              <div
                key={file}
                className="flex items-center justify-center text-xs text-muted font-mono"
                style={{ width: squareSize }}
              >
                {file}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PromotionModal({
  color,
  onSelect,
  onCancel,
  squareSize,
  square,
  flipped,
}: {
  color: 'w' | 'b'
  onSelect: (piece: string) => void
  onCancel: () => void
  squareSize: number
  square: Square
  flipped: boolean
}) {
  const pieces = ['q', 'r', 'b', 'n']
  const PIECE_UNICODE: Record<string, string> = {
    wq: '♕', wr: '♖', wb: '♗', wn: '♘',
    bq: '♛', br: '♜', bb: '♝', bn: '♞',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-20"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.8, y: -10 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-surface border border-border rounded-xl p-3 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {pieces.map((p) => (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className="w-14 h-14 flex items-center justify-center text-4xl rounded-lg border border-border hover:border-accent hover:bg-accent/10 transition-all"
          >
            {PIECE_UNICODE[color + p]}
          </button>
        ))}
      </motion.div>
    </motion.div>
  )
}

function findKingSquare(chess: Chess, color: 'w' | 'b'): Square | null {
  const board = chess.board()
  for (const row of board) {
    for (const piece of row) {
      if (piece?.type === 'k' && piece.color === color) {
        return piece.square
      }
    }
  }
  return null
}
