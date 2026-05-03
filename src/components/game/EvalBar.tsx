'use client'

import { useGameStore } from '@/store/gameStore'

export function EvalBar() {
  const { evalScore } = useGameStore()

  const clamped = Math.max(-10, Math.min(10, evalScore))
  const whitePercent = ((clamped + 10) / 20) * 100

  const label = Math.abs(evalScore) > 50
    ? (evalScore > 0 ? 'M' : '-M')
    : (evalScore > 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1))

  const isWhiteWinning = evalScore > 0.3
  const isBlackWinning = evalScore < -0.3

  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 22, height: 560 }}>
      {/* Bar */}
      <div
        className="relative w-full flex-1 overflow-hidden"
        style={{
          background: '#0e1117',
          border: '1px solid #1e2535',
          borderRadius: 6,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        {/* Black portion */}
        <div
          className="absolute top-0 left-0 right-0 transition-all duration-500"
          style={{
            height: `${100 - whitePercent}%`,
            background: 'linear-gradient(to bottom, #1a1a2e, #0d0d14)',
          }}
        />
        {/* White portion */}
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-500"
          style={{
            height: `${whitePercent}%`,
            background: isWhiteWinning
              ? 'linear-gradient(to top, #e8c97e, #c8a96e)'
              : 'linear-gradient(to top, #d4cfc8, #a09890)',
          }}
        />
        {/* Center line */}
        <div
          className="absolute left-0 right-0 transition-all duration-500"
          style={{
            top: `${100 - whitePercent}%`,
            height: '1px',
            background: isWhiteWinning
              ? 'rgba(232,201,126,0.8)'
              : isBlackWinning
              ? 'rgba(100,120,160,0.8)'
              : 'rgba(255,255,255,0.2)',
            boxShadow: isWhiteWinning
              ? '0 0 6px rgba(200,169,110,0.6)'
              : 'none',
          }}
        />
      </div>

      {/* Label */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          color: 'var(--muted)',
          letterSpacing: '0.05em',
          writingMode: 'horizontal-tb',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}
