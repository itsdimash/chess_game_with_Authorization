'use client'

import React from 'react'
import type { Square } from 'chess.js'

interface PieceProps {
  piece: { type: string; color: string; square: Square }
  size: number
  onMouseDown?: (e: React.MouseEvent) => void
  isDragging?: boolean
}

const PIECE_UNICODE: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
}

export function PieceComponent({ piece, size, onMouseDown, isDragging }: PieceProps) {
  const key = piece.color + piece.type
  const symbol = PIECE_UNICODE[key] ?? '?'

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.75,
        lineHeight: `${size}px`,
        textAlign: 'center',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        opacity: isDragging ? 0.5 : 1,
        color: piece.color === 'w' ? '#ffffff' : '#000000',
        filter: piece.color === 'w'
          ? 'drop-shadow(0 1px 3px rgba(0,0,0,0.9)) drop-shadow(0 0 1px rgba(0,0,0,0.8))'
          : 'drop-shadow(0 1px 3px rgba(255,255,255,0.4))',
        transition: 'opacity 0.1s',
      }}
    >
      {symbol}
    </div>
  )
}
