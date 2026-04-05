'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { calculateLeaderboard } from '@/lib/calculations'
import type { Player, Score, Game, LeaderboardEntry, Round } from '@/types'

function fmt(n: number) {
  const abs = Math.abs(n).toFixed(2).replace(/\.00$/, '')
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

export default function LeaderboardPage() {
  const { id: roundId } = useParams<{ id: string }>()
  const [round, setRound] = useState<Round | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [holesPlayed, setHolesPlayed] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: roundData }, { data: players }, { data: scores }, { data: games }, { data: modifiers }] = await Promise.all([
      supabase.from('rounds').select('*').eq('id', roundId).single(),
      supabase.from('players').select('*').eq('round_id', roundId).order('created_at'),
      supabase.from('scores').select('*').eq('round_id', roundId),
      supabase.from('games').select('*').eq('round_id', roundId),
      supabase.from('hole_modifiers').select('hole_number, multiplier').eq('round_id', roundId),
    ])

    if (roundData) setRound(roundData)

    if (players && scores && games) {
      const holeMultipliers: Record<number, number> = {}
      for (const modifier of modifiers ?? []) {
        holeMultipliers[modifier.hole_number] = Number(modifier.multiplier)
      }

      const leaderboard = calculateLeaderboard(
        players as Player[],
        scores as Score[],
        games as Game[],
        holeMultipliers
      )
      setEntries(leaderboard)
      setHolesPlayed(scores.length > 0 ? Math.max(...(scores as Score[]).map((s) => s.hole_number)) : 0)
    }
    setLoading(false)
  }, [roundId])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })

    // Real-time subscription
    const supabase = createClient()
    const channel = supabase
      .channel(`round-${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `round_id=eq.${roundId}` }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [load, roundId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-5 pt-14 pb-4">
        <div className="flex items-center justify-between mb-3">
          <Link href={`/round/${roundId}/scorecard`} className="text-gray-400 text-sm font-medium">← Scores</Link>
          <Link href={`/round/${roundId}/summary`} className="text-gray-400 text-sm font-medium">Summary →</Link>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{round?.course_name}</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {holesPlayed > 0 ? `Through ${holesPlayed} hole${holesPlayed !== 1 ? 's' : ''}` : 'No scores yet'}
          {' · '}<span className="text-green-600 font-medium">Live</span>
        </p>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-2.5">
        {entries.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium text-gray-500">No scores yet</p>
            <Link href={`/round/${roundId}/scorecard`} className="text-green-600 mt-2 block text-sm font-semibold">
              Enter scores →
            </Link>
          </div>
        )}

        {entries.map((entry, i) => (
          <div key={entry.player.id} className="bg-white rounded-2xl px-4 py-3.5 border border-gray-100 flex items-center gap-3.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
              i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{entry.player.name}</p>
              {Object.entries(entry.breakdown).length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {Object.entries(entry.breakdown)
                    .map(([k, v]) => `${k}: ${fmt(v)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
            <span className={`text-xl font-bold tabular-nums ${entry.total >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {fmt(entry.total)}
            </span>
          </div>
        ))}

        {/* Share link */}
        <div className="mt-2 bg-white rounded-2xl px-4 py-4 border border-gray-100">
          <p className="text-sm font-medium text-gray-600 mb-2.5">Share this round</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-gray-500 truncate">
              {typeof window !== 'undefined' ? `${window.location.origin}/round/${roundId}` : `/round/${roundId}`}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/round/${roundId}`)}
              className="text-sm bg-green-600 text-white px-4 py-2.5 rounded-xl font-medium active:bg-green-700 transition flex-shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
