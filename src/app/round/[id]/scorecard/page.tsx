'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Player, Score, Round, Game } from '@/types'
import { calculateLeaderboard } from '@/lib/calculations'

const TOTAL_HOLES = 18

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

type TeamAssignments = Record<string, { A: string[]; B: string[] }>

function getTeamGames(games: Game[]) {
  return games.filter((game) => Boolean((game.rules_json as { team_play?: boolean }).team_play))
}

function getHoleTeams(game: Game, hole: number) {
  const assignments = (game.rules_json as { team_assignments?: TeamAssignments }).team_assignments ?? {}
  return assignments[String(hole)] ?? { A: [], B: [] }
}

export default function ScorecardPage() {
  const { id: roundId } = useParams<{ id: string }>()
  const router = useRouter()

  const [round, setRound] = useState<Round | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [games, setGames] = useState<Game[]>([])
  const [holeMultipliers, setHoleMultipliers] = useState<Record<number, number>>({})
  const [currentHole, setCurrentHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [teamSaving, setTeamSaving] = useState(false)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [
      { data: roundData },
      { data: playersData },
      { data: scoresData },
      { data: gamesData },
      { data: modifiersData },
    ] = await Promise.all([
      supabase.from('rounds').select('*').eq('id', roundId).single(),
      supabase.from('players').select('*').eq('round_id', roundId).order('created_at'),
      supabase.from('scores').select('*').eq('round_id', roundId),
      supabase.from('games').select('*').eq('round_id', roundId),
      supabase.from('hole_modifiers').select('hole_number, multiplier').eq('round_id', roundId),
    ])

    if (roundData) setRound(roundData)
    if (playersData) setPlayers(playersData)
    if (gamesData) setGames(gamesData as Game[])

    if (modifiersData) {
      const map: Record<number, number> = {}
      for (const m of modifiersData) map[m.hole_number] = m.multiplier
      setHoleMultipliers(map)
    }

    if (scoresData) {
      const map: Record<string, Record<number, number>> = {}
      for (const s of scoresData as Score[]) {
        if (!map[s.player_id]) map[s.player_id] = {}
        map[s.player_id][s.hole_number] = s.strokes
      }
      setScores(map)

      const maxHole = scoresData.length > 0 ? Math.max(...scoresData.map((s) => s.hole_number)) : 0
      setCurrentHole(Math.min(maxHole + 1, TOTAL_HOLES))
    }

    setLoading(false)
  }, [roundId])

  useEffect(() => {
    queueMicrotask(() => {
      void loadData()
    })
  }, [loadData])

  function setScore(playerId: string, hole: number, value: string) {
    const strokes = parseInt(value)
    setScores((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? {}), [hole]: isNaN(strokes) ? 0 : strokes },
    }))
  }

  async function setMultiplier(hole: number, multiplier: number) {
    setHoleMultipliers((prev) => ({ ...prev, [hole]: multiplier }))
    const supabase = createClient()
    if (multiplier === 1) {
      await supabase.from('hole_modifiers').delete().eq('round_id', roundId).eq('hole_number', hole)
    } else {
      await supabase.from('hole_modifiers').upsert(
        { round_id: roundId, hole_number: hole, multiplier },
        { onConflict: 'round_id,hole_number' }
      )
    }
  }

  async function saveHole() {
    setSaving(true)
    const upserts: Omit<Score, 'id'>[] = players
      .map((p) => ({
        round_id: roundId,
        player_id: p.id,
        hole_number: currentHole,
        strokes: scores[p.id]?.[currentHole] ?? 0,
      }))
      .filter((s) => s.strokes > 0)

    if (upserts.length > 0) {
      const supabase = createClient()
      await supabase.from('scores').upsert(upserts, { onConflict: 'player_id,hole_number' })
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 1500)

    if (currentHole < TOTAL_HOLES) {
      setCurrentHole(currentHole + 1)
    }
    setSaving(false)
  }

  async function finishRound() {
    const supabase = createClient()
    await supabase.from('rounds').update({ status: 'completed' }).eq('id', roundId)
    router.push(`/round/${roundId}/summary?open=details`)
  }

  const currentMultiplier = holeMultipliers[currentHole] ?? 1
  const totalBaseStake = games.reduce((sum, game) => sum + game.stake, 0)
  const currentHoleTotalBet = totalBaseStake * currentMultiplier
  const currentHoleBetInput = Number.isInteger(currentHoleTotalBet)
    ? String(currentHoleTotalBet)
    : currentHoleTotalBet.toFixed(2).replace(/\.00$/, '')

  async function updateHoleBet(nextBet: string) {
    if (totalBaseStake <= 0) return

    const parsedBet = parseFloat(nextBet)
    if (!Number.isFinite(parsedBet) || parsedBet <= 0) return

    const nextMultiplier = parsedBet / totalBaseStake
    await setMultiplier(currentHole, parseFloat(nextMultiplier.toFixed(2)))
  }

  async function updateHoleTeams(team: 'A' | 'B', playerId: string) {
    const teamGames = getTeamGames(games).filter((game) =>
      Boolean((game.rules_json as { allow_team_changes?: boolean }).allow_team_changes)
    )

    if (teamGames.length === 0) return

    setTeamSaving(true)
    const supabase = createClient()
    const updates = teamGames.map((game) => {
      const assignments = (game.rules_json as { team_assignments?: TeamAssignments }).team_assignments ?? {}
      const current = assignments[String(currentHole)] ?? { A: [], B: [] }
      const nextA = current.A.filter((id) => id !== playerId)
      const nextB = current.B.filter((id) => id !== playerId)

      if (team === 'A') nextA.push(playerId)
      else nextB.push(playerId)

      return {
        id: game.id,
        rules_json: {
          ...game.rules_json,
          team_assignments: {
            ...assignments,
            [String(currentHole)]: { A: nextA, B: nextB },
          },
        },
      }
    })

    for (const update of updates) {
      const { error } = await supabase
        .from('games')
        .update({ rules_json: update.rules_json })
        .eq('id', update.id)

      if (error) {
        setTeamSaving(false)
        return
      }
    }

    setGames((prev) => prev.map((game) => {
      const update = updates.find((candidate) => candidate.id === game.id)
      return update ? { ...game, rules_json: update.rules_json } : game
    }))
    setTeamSaving(false)
  }

  const allHolesEntered = players.every((p) =>
    Array.from({ length: TOTAL_HOLES }, (_, i) => i + 1).every(
      (h) => (scores[p.id]?.[h] ?? 0) > 0
    )
  )
  const frontNineEntered = players.every((p) =>
    Array.from({ length: 9 }, (_, i) => i + 1).every(
      (h) => (scores[p.id]?.[h] ?? 0) > 0
    )
  )

  const scoresList: Score[] = Object.entries(scores).flatMap(([playerId, holes]) =>
    Object.entries(holes).map(([hole, strokes]) => ({
      id: '',
      round_id: roundId,
      player_id: playerId,
      hole_number: Number(hole),
      strokes,
    }))
  )
  const leaderboard = games.length > 0
    ? calculateLeaderboard(players, scoresList, games, holeMultipliers)
    : []
  const activeTeamGame = getTeamGames(games)[0] ?? null
  const currentHoleTeams = activeTeamGame ? getHoleTeams(activeTeamGame, currentHole) : null
  const canChangeTeamsByHole = activeTeamGame
    ? Boolean((activeTeamGame.rules_json as { allow_team_changes?: boolean }).allow_team_changes)
    : false

  if (loading) {
    return (
      <div className="app-page flex items-center justify-center">
        <p className="text-[#5a6758]">Loading…</p>
      </div>
    )
  }

  return (
    <div className="app-page pb-8">
      <div className="page-wrap pt-6">
        <section className="hero-panel px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-label text-[#d6ddcc]">Live Round</p>
              <h1 className="mt-2 font-serif text-[2.15rem] font-semibold leading-none text-[#f8f3e9]">
                Hole {currentHole}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#dbe7dd]">
                {round?.course_name} · {round?.tee_box} tees
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-[#f8f3e9]"
            >
              Back
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/10 px-4 py-3 text-[#f8f3e9]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe7dd]">Progress</p>
              <p className="mt-1 text-lg font-semibold">{currentHole} of {TOTAL_HOLES}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe7dd]">Entered</p>
              <p className="mt-1 text-lg font-semibold">
                {players.filter((player) => (scores[player.id]?.[currentHole] ?? 0) > 0).length}/{players.length}
              </p>
            </div>
          </div>
        </section>

        <section className="surface-card-strong mt-4 overflow-x-auto px-4 py-4">
          <div className="flex min-w-max gap-2">
          {Array.from({ length: TOTAL_HOLES }, (_, i) => i + 1).map((h) => {
            const complete = players.every((p) => (scores[p.id]?.[h] ?? 0) > 0)
            const mult = holeMultipliers[h] ?? 1
            return (
              <div key={h} className="relative flex-shrink-0">
                <button
                  onClick={() => setCurrentHole(h)}
                  className={`h-10 w-10 rounded-full text-sm font-semibold transition ${
                    h === currentHole
                      ? 'bg-[#174c38] text-[#f8f3e9]'
                      : complete
                      ? 'bg-[#dce8df] text-[#174c38]'
                      : 'bg-[#ece5d6] text-[#6f695a]'
                  }`}
                >
                  {h}
                </button>
                {mult > 1 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#b98d35] text-[10px] font-bold text-[#112218] leading-none">
                    {mult}
                  </span>
                )}
              </div>
            )
          })}
          </div>
        </section>

        <div className="mt-4 flex items-center justify-between">
          <button
            disabled={currentHole === 1}
            onClick={() => setCurrentHole(currentHole - 1)}
            className="secondary-button h-11 w-11 rounded-full p-0 text-xl disabled:opacity-30"
          >
            ‹
          </button>
          <h2 className="font-serif text-3xl font-semibold text-[#112218]">Hole {currentHole}</h2>
          <button
            disabled={currentHole === TOTAL_HOLES}
            onClick={() => setCurrentHole(currentHole + 1)}
            className="secondary-button h-11 w-11 rounded-full p-0 text-xl disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {games.length > 0 && (
          <div className="surface-card mt-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6758]">Hole Bet</p>
                <p className="mt-1 text-xl font-bold text-[#112218]">
                  {totalBaseStake > 0 ? formatCurrency(currentHoleTotalBet) : 'No stake set'}
                </p>
                <p className="mt-1 text-xs text-[#536153]">
                  {Number.isInteger(currentMultiplier) ? currentMultiplier : currentMultiplier.toFixed(2)}x of {formatCurrency(totalBaseStake || 0)}
                </p>
              </div>
              <div className="w-28">
                <label htmlFor="custom-hole-bet" className="mb-1 block text-xs font-medium text-[#5a6758]">
                  Change it
                </label>
                <div className="flex items-center overflow-hidden rounded-xl border border-[rgba(17,34,24,0.1)] bg-[#fffdf8]">
                  <span className="px-3 text-sm text-[#5a6758]">$</span>
                  <input
                    key={`${currentHole}-${currentHoleBetInput}`}
                    id="custom-hole-bet"
                    type="number"
                    defaultValue={currentHoleBetInput}
                    onBlur={(e) => void updateHoleBet(e.target.value)}
                    min={0.01}
                    step={0.01}
                    className="w-full bg-transparent py-2.5 pr-3 text-sm font-medium text-[#112218] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3].map((m) => {
                const totalAmount = totalBaseStake * m
                const isActive = currentMultiplier === m

                return (
                  <button
                    key={m}
                    onClick={() => void setMultiplier(currentHole, m)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-[#174c38] text-[#f8f3e9]'
                        : 'bg-[#ece5d6] text-[#6f695a]'
                    }`}
                  >
                    {formatCurrency(totalAmount)} · {m === 1 ? '1x' : m === 2 ? 'Double' : 'Triple'}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 space-y-1">
              {games.map((game) => (
                <div key={game.id} className="flex items-center justify-between text-sm text-[#536153]">
                  <span>{game.name}</span>
                  <span className="font-medium text-[#112218]">
                    {formatCurrency(game.stake * currentMultiplier)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTeamGame && currentHoleTeams && (
          <div className="surface-card mt-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6758]">Teams</p>
                <p className="mt-1 text-lg font-semibold text-[#112218]">{activeTeamGame.name}</p>
                <p className="mt-1 text-sm text-[#536153]">
                  {canChangeTeamsByHole ? 'Tap players to switch teams for this hole.' : 'Teams are fixed for this round.'}
                </p>
              </div>
              {teamSaving && <span className="text-sm text-[#5a6758]">Saving…</span>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#f8f3e9] px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6758]">Team A</p>
                <div className="mt-2 space-y-2">
                  {players.map((player) => (
                    <button
                      key={`${player.id}-hole-A`}
                      type="button"
                      disabled={!canChangeTeamsByHole}
                      onClick={() => void updateHoleTeams('A', player.id)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                        currentHoleTeams.A.includes(player.id)
                          ? 'bg-[#174c38] text-[#f8f3e9]'
                          : 'bg-white text-[#536153]'
                      } disabled:opacity-60`}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#f8f3e9] px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6758]">Team B</p>
                <div className="mt-2 space-y-2">
                  {players.map((player) => (
                    <button
                      key={`${player.id}-hole-B`}
                      type="button"
                      disabled={!canChangeTeamsByHole}
                      onClick={() => void updateHoleTeams('B', player.id)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                        currentHoleTeams.B.includes(player.id)
                          ? 'bg-[#174c38] text-[#f8f3e9]'
                          : 'bg-white text-[#536153]'
                      } disabled:opacity-60`}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {players.map((player) => (
            <div key={player.id} className="surface-card-strong flex items-center justify-between px-4 py-4">
              <div>
                <p className="font-semibold text-[#112218]">{player.name}</p>
                {player.handicap != null && (
                  <p className="mt-1 text-xs text-[#5a6758]">HCP {player.handicap}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const cur = scores[player.id]?.[currentHole] ?? 0
                    if (cur > 1) setScore(player.id, currentHole, String(cur - 1))
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ece5d6] text-2xl font-light text-[#6f695a]"
                >
                  −
                </button>
                <span className="w-9 text-center text-2xl font-bold tabular-nums text-[#112218]">
                  {scores[player.id]?.[currentHole] || '—'}
                </span>
                <button
                  onClick={() => {
                    const cur = scores[player.id]?.[currentHole] ?? 0
                    setScore(player.id, currentHole, String(cur + 1))
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#174c38] text-2xl font-light text-[#f8f3e9]"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          <button
            disabled={saving}
            onClick={saveHole}
            className="primary-button w-full disabled:opacity-40"
          >
            {saved ? 'Saved ✓' : saving ? 'Saving…' : currentHole < TOTAL_HOLES ? 'Save & Next Hole' : 'Save Final Hole'}
          </button>

          {(frontNineEntered || allHolesEntered) && (
            <button
              onClick={finishRound}
              className="secondary-button w-full border-[#174c38] text-[#174c38]"
            >
              Finish Round & See Results
            </button>
          )}
        </div>

        {leaderboard.length > 0 && (
          <div className="mt-6">
            <h3 className="section-label mb-3 px-1">Standings</h3>
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div key={entry.player.id} className="surface-card flex items-center justify-between px-4 py-3">
                  <p className="font-semibold text-[#112218]">{entry.player.name}</p>
                  <p className={`text-base font-bold tabular-nums ${
                    entry.total > 0 ? 'text-[#174c38]' : entry.total < 0 ? 'text-[#a34d2d]' : 'text-[#5a6758]'
                  }`}>
                    {entry.total > 0 ? `+$${entry.total.toFixed(2)}` : entry.total < 0 ? `-$${Math.abs(entry.total).toFixed(2)}` : 'E'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h3 className="section-label mb-3 px-1">Scorecard</h3>
          <div className="surface-card overflow-x-auto px-4 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#5a6758]">
                  <th className="py-1 pr-3 text-left font-medium">Player</th>
                  {Array.from({ length: 9 }, (_, i) => (
                    <th key={i + 1} className="w-7 text-center font-medium">{i + 1}</th>
                  ))}
                  <th className="w-8 text-center font-semibold text-[#314131]">OUT</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-t border-[rgba(17,34,24,0.08)]">
                    <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-[#112218]">{p.name}</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i + 1} className="w-7 text-center text-[#314131]">
                        {scores[p.id]?.[i + 1] || ''}
                      </td>
                    ))}
                    <td className="w-8 text-center font-semibold text-[#112218]">
                      {Array.from({ length: 9 }, (_, i) => scores[p.id]?.[i + 1] ?? 0).reduce((a, b) => a + b, 0) || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-[#5a6758]">
                  <th className="py-1 pr-3 text-left font-medium">Player</th>
                  {Array.from({ length: 9 }, (_, i) => (
                    <th key={i + 10} className="w-7 text-center font-medium">{i + 10}</th>
                  ))}
                  <th className="w-8 text-center font-semibold text-[#314131]">IN</th>
                  <th className="w-8 text-center font-semibold text-[#112218]">TOT</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const front = Array.from({ length: 9 }, (_, i) => scores[p.id]?.[i + 1] ?? 0).reduce((a, b) => a + b, 0)
                  const back = Array.from({ length: 9 }, (_, i) => scores[p.id]?.[i + 10] ?? 0).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={p.id} className="border-t border-[rgba(17,34,24,0.08)]">
                      <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-[#112218]">{p.name}</td>
                      {Array.from({ length: 9 }, (_, i) => (
                        <td key={i + 10} className="w-7 text-center text-[#314131]">
                          {scores[p.id]?.[i + 10] || ''}
                        </td>
                      ))}
                      <td className="w-8 text-center font-semibold text-[#112218]">{back || ''}</td>
                      <td className="w-8 text-center font-bold text-[#112218]">{front + back || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
