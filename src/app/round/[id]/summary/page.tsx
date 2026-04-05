import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { calculateLeaderboard } from '@/lib/calculations'
import type { Player, Score, Game } from '@/types'
import SaveRoundDetails from './SaveRoundDetails'

function fmt(n: number) {
  const abs = Math.abs(n).toFixed(2).replace(/\.00$/, '')
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params
  const supabase = await createClient()

  const [{ data: round }, { data: players }, { data: scores }, { data: games }, { data: modifiers }] = await Promise.all([
    supabase.from('rounds').select('*').eq('id', roundId).single(),
    supabase.from('players').select('*').eq('round_id', roundId).order('created_at'),
    supabase.from('scores').select('*').eq('round_id', roundId),
    supabase.from('games').select('*').eq('round_id', roundId),
    supabase.from('hole_modifiers').select('hole_number, multiplier').eq('round_id', roundId),
  ])

  if (!round) notFound()

  const holeMultipliers: Record<number, number> = {}
  for (const modifier of modifiers ?? []) {
    holeMultipliers[modifier.hole_number] = Number(modifier.multiplier)
  }

  const entries = calculateLeaderboard(
    (players ?? []) as Player[],
    (scores ?? []) as Score[],
    (games ?? []) as Game[],
    holeMultipliers
  )

  const maxHole = scores && scores.length > 0 ? Math.max(...(scores as Score[]).map((s) => s.hole_number)) : 0
  const date = new Date(round.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Build who owes whom
  const positives = entries.filter((e) => e.total > 0)
  const negatives = entries.filter((e) => e.total < 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-5 pt-14 pb-4">
        <Link href={`/round/${roundId}/leaderboard`} className="text-gray-400 text-sm font-medium block mb-3">← Back</Link>
        <h1 className="text-xl font-bold text-gray-900">{round.course_name}</h1>
        <p className="text-gray-400 text-sm mt-0.5">{date} · {maxHole} holes</p>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        {/* Final payouts */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Final Payouts</h2>
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <div key={entry.player.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                  i === 0 ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-100 text-gray-500'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{entry.player.name}</p>
                  {Object.entries(entry.breakdown).length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {Object.entries(entry.breakdown).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ')}
                    </p>
                  )}
                </div>
                <span className={`text-xl font-bold ${entry.total >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {fmt(entry.total)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Settlement */}
        {positives.length > 0 && negatives.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Settlement</h2>
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              {negatives.map((loser) => (
                positives.map((winner) => {
                  const amount = Math.min(Math.abs(loser.total), winner.total)
                  if (amount <= 0) return null
                  return (
                    <div key={`${loser.player.id}-${winner.player.id}`} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-red-500">{loser.player.name}</span>
                      <span className="text-gray-400">owes</span>
                      <span className="font-medium text-green-600">{winner.player.name}</span>
                      <span className="ml-auto font-semibold text-gray-900">${Math.abs(loser.total).toFixed(2)}</span>
                    </div>
                  )
                })
              ))}
            </div>
          </section>
        )}

        {/* Full scorecard */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Full Scorecard</h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="text-sm w-full p-4">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-4 font-medium text-gray-500">Player</th>
                  {Array.from({ length: 9 }, (_, i) => (
                    <th key={i + 1} className="w-7 text-center py-2 font-medium text-gray-400">{i + 1}</th>
                  ))}
                  <th className="w-10 text-center py-2 font-semibold text-gray-600">OUT</th>
                  {Array.from({ length: 9 }, (_, i) => (
                    <th key={i + 10} className="w-7 text-center py-2 font-medium text-gray-400">{i + 10}</th>
                  ))}
                  <th className="w-10 text-center py-2 font-semibold text-gray-600">IN</th>
                  <th className="w-10 text-center py-2 font-bold text-gray-900">TOT</th>
                </tr>
              </thead>
              <tbody>
                {(players as Player[]).map((player) => {
                  const playerScores: Record<number, number> = {}
                  ;(scores as Score[]).filter((s) => s.player_id === player.id).forEach((s) => {
                    playerScores[s.hole_number] = s.strokes
                  })
                  const front = Array.from({ length: 9 }, (_, i) => playerScores[i + 1] ?? 0).reduce((a, b) => a + b, 0)
                  const back = Array.from({ length: 9 }, (_, i) => playerScores[i + 10] ?? 0).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={player.id} className="border-t border-gray-100">
                      <td className="py-2 px-4 font-medium text-gray-900 whitespace-nowrap">{player.name}</td>
                      {Array.from({ length: 9 }, (_, i) => (
                        <td key={i + 1} className="w-7 text-center text-gray-700 py-2">
                          {playerScores[i + 1] || ''}
                        </td>
                      ))}
                      <td className="w-10 text-center font-semibold text-gray-900 py-2">{front || ''}</td>
                      {Array.from({ length: 9 }, (_, i) => (
                        <td key={i + 10} className="w-7 text-center text-gray-700 py-2">
                          {playerScores[i + 10] || ''}
                        </td>
                      ))}
                      <td className="w-10 text-center font-semibold text-gray-900 py-2">{back || ''}</td>
                      <td className="w-10 text-center font-bold text-gray-900 py-2">{front + back || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Save round details */}
        <SaveRoundDetails
          roundId={roundId}
          currentCourseName={round.course_name}
          currentDate={round.date}
          currentTeeBox={round.tee_box}
        />

        {/* Back to dashboard */}
        <Link
          href="/dashboard"
          className="block w-full text-center bg-green-600 text-white py-3.5 rounded-2xl font-semibold active:bg-green-700 transition"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
