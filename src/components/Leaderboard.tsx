'use client'

// src/components/Leaderboard.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/supabase'

interface LeaderboardRow {
  username: string
  wins: number
  losses: number
  draws: number
  total_games: number
}

export function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('leaderboard')
      .select('*')
      .limit(10)
      .then(({ data, error }) => {
        if (error) setError('Failed to load leaderboard.')
        else if (data) setRows(data as LeaderboardRow[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 w-full max-w-md">
      <h2 className="text-lg font-bold text-text mb-4">🏆 Leaderboard</h2>

      {loading ? (
        <p className="text-muted text-sm text-center py-4">Loading...</p>
      ) : error ? (
        <p className="text-red-400 text-sm text-center py-4">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted text-sm text-center py-4">No games played yet. Be the first!</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase border-b border-border">
              <th className="text-left pb-2">#</th>
              <th className="text-left pb-2">Player</th>
              <th className="text-center pb-2">W</th>
              <th className="text-center pb-2">L</th>
              <th className="text-center pb-2">D</th>
              <th className="text-center pb-2">Games</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.username} className="border-b border-border/50 last:border-0">
                <td className="py-2 text-muted">{i + 1}</td>
                <td className="py-2 font-medium text-text">
                  {i === 0 ? '👑 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}
                  {row.username}
                </td>
                <td className="py-2 text-center text-green-400">{row.wins}</td>
                <td className="py-2 text-center text-red-400">{row.losses}</td>
                <td className="py-2 text-center text-muted">{row.draws}</td>
                <td className="py-2 text-center text-muted">{row.total_games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
