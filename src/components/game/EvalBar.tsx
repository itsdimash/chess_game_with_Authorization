'use client'

import { useGameStore } from '@/store/gameStore'

export function EvalBar() {
  const { evalScore } = useGameStore()

  // Clamp to [-10, 10] for display, convert to percentage
  const clamped = Math.max(-10, Math.min(10, evalScore))
  const whitePercent = ((clamped + 10) / 20) * 100

  const label = Math.abs(evalScore) > 50
    ? (evalScore > 0 ? 'M' : '-M')
    : (evalScore > 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1))

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: 20, height: 560 }}>
      <div
        className="relative w-full flex-1 rounded-full overflow-hidden"
        style={{ background: '#1a1814', border: '1px solid #2e2a24' }}
      >
        {/* Black portion (top) */}
        <div
          className="absolute top-0 left-0 right-0 bg-[#2a2218] transition-all duration-500"
          style={{ height: `${100 - whitePercent}%` }}
        />
        {/* White portion (bottom) */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-[#f0d9b5] transition-all duration-500"
          style={{ height: `${whitePercent}%` }}
        />
      </div>
      <span className="text-[9px] text-muted font-mono" style={{ writingMode: 'horizontal-tb' }}>
        {label}
      </span>
    </div>
  )
}
