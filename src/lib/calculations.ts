import type { Player, Score, Game, LeaderboardEntry } from '@/types'

export type ScoreMap = Record<string, Record<number, number>> // playerId → hole → strokes

type CustomGameEngine = {
  mode?: 'hole_by_hole' | 'match_play' | 'segment_match'
  matchup?: 'all_players' | 'pairwise'
  scoring?: 'low_score'
  tie_policy?: 'carry' | 'push' | 'halve' | 'split'
  payout_style?: 'winner_takes_from_all' | 'flat_match_bet'
  presses_allowed?: boolean
  segments?: Array<{
    label?: string
    start_hole: number
    end_hole: number
    stake_multiplier?: number
  }>
}

type TeamAssignments = Record<string, { A: string[]; B: string[] }>

export function buildScoreMap(scores: Score[]): ScoreMap {
  const map: ScoreMap = {}
  for (const s of scores) {
    if (!map[s.player_id]) map[s.player_id] = {}
    map[s.player_id][s.hole_number] = s.strokes
  }
  return map
}

function getCustomEngine(game: Game): CustomGameEngine {
  const raw = (game.rules_json as { engine?: CustomGameEngine }).engine
  return raw ?? {}
}

function getCompletedHoleScores(
  players: Player[],
  scoreMap: ScoreMap,
  hole: number
): Array<{ id: string; strokes: number }> | null {
  const holeScores = players
    .map((player) => ({ id: player.id, strokes: scoreMap[player.id]?.[hole] }))
    .filter((entry) => entry.strokes !== undefined) as Array<{ id: string; strokes: number }>

  return holeScores.length === players.length ? holeScores : null
}

function mergeWinnings(
  target: Record<string, number>,
  source: Record<string, number>
) {
  for (const [playerId, amount] of Object.entries(source)) {
    target[playerId] = (target[playerId] ?? 0) + amount
  }
}

function initWinnings(players: Player[]): Record<string, number> {
  const winnings: Record<string, number> = {}
  players.forEach((player) => { winnings[player.id] = 0 })
  return winnings
}

function getDefaultTeams(players: Player[]) {
  const A: string[] = []
  const B: string[] = []

  players.forEach((player, index) => {
    if (index % 2 === 0) A.push(player.id)
    else B.push(player.id)
  })

  return { A, B }
}

function getTeamsForHole(game: Game, hole: number, players: Player[]) {
  const assignments = (game.rules_json as { team_assignments?: TeamAssignments }).team_assignments
  return assignments?.[String(hole)] ?? getDefaultTeams(players)
}

function getPlayerScoresForHole(
  team: string[],
  scoreMap: ScoreMap,
  hole: number
) {
  return team
    .map((playerId) => scoreMap[playerId]?.[hole])
    .filter((score): score is number => score !== undefined)
}

function settleFlatBet(
  winners: string[],
  losers: string[],
  totalAmount: number,
  winnings: Record<string, number>
) {
  if (winners.length === 0 || losers.length === 0 || totalAmount <= 0) return

  const winShare = totalAmount / winners.length
  const loseShare = totalAmount / losers.length

  winners.forEach((playerId) => { winnings[playerId] += winShare })
  losers.forEach((playerId) => { winnings[playerId] -= loseShare })
}

function settleTeamVsTeam(
  teamA: string[],
  teamB: string[],
  winner: 'A' | 'B',
  totalAmount: number,
  winnings: Record<string, number>
) {
  settleFlatBet(winner === 'A' ? teamA : teamB, winner === 'A' ? teamB : teamA, totalAmount, winnings)
}

// =====================
// SKINS
// Each hole's skin is worth stake * multiplier. Ties carry the accumulated
// value forward to the next hole.
// =====================
export function calculateSkins(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings: Record<string, number> = {}
  players.forEach((p) => (winnings[p.id] = 0))

  let carriedValue = 0 // accumulated dollar value of tied holes carrying forward

  for (let hole = 1; hole <= holesPlayed; hole++) {
    const holeScores = players
      .map((p) => ({ id: p.id, strokes: scoreMap[p.id]?.[hole] }))
      .filter((s) => s.strokes !== undefined) as { id: string; strokes: number }[]

    if (holeScores.length < players.length) continue

    const multiplier = holeMultipliers[hole] ?? 1
    const holeValue = stake * multiplier

    const min = Math.min(...holeScores.map((s) => s.strokes))
    const winners = holeScores.filter((s) => s.strokes === min)

    if (winners.length === 1) {
      const totalValue = holeValue + carriedValue
      winnings[winners[0].id] += totalValue * (players.length - 1)
      players.forEach((p) => {
        if (p.id !== winners[0].id) winnings[p.id] -= totalValue
      })
      carriedValue = 0
    } else {
      carriedValue += holeValue
    }
  }

  return winnings
}

// =====================
// NASSAU
// Three bets: front 9, back 9, 18-hole overall — each worth `stake`.
// Holes with multiplier > 1 count that many "wins" in the match tally.
// =====================
export function calculateNassau(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  pressesAllowed: boolean,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings: Record<string, number> = {}
  players.forEach((p) => (winnings[p.id] = 0))

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i]
      const p2 = players[j]
      const pair = headToHeadNassau(p1, p2, scoreMap, stake, pressesAllowed, holesPlayed, holeMultipliers)
      winnings[p1.id] += pair[p1.id]
      winnings[p2.id] += pair[p2.id]
    }
  }

  return winnings
}

function headToHeadNassau(
  p1: Player,
  p2: Player,
  scoreMap: ScoreMap,
  stake: number,
  pressesAllowed: boolean,
  holesPlayed: number,
  holeMultipliers: Record<number, number>
): Record<string, number> {
  const w: Record<string, number> = { [p1.id]: 0, [p2.id]: 0 }

  // Sum of multiplier weights for a range of holes (remaining / total weight)
  function weightedHolesRemaining(afterHole: number, endHole: number): number {
    let total = 0
    for (let h = afterHole + 1; h <= endHole; h++) total += holeMultipliers[h] ?? 1
    return total
  }

  // p1's advantage: positive = p1 winning. Each hole counts as multiplier wins.
  function matchScore(startHole: number, endHole: number): number {
    let p1up = 0
    for (let h = startHole; h <= Math.min(endHole, holesPlayed); h++) {
      const s1 = scoreMap[p1.id]?.[h]
      const s2 = scoreMap[p2.id]?.[h]
      if (s1 === undefined || s2 === undefined) continue
      const m = holeMultipliers[h] ?? 1
      if (s1 < s2) p1up += m
      else if (s2 < s1) p1up -= m
    }
    return p1up
  }

  function settle(startHole: number, endHole: number, amount: number) {
    const holesCompleted = Math.min(endHole, holesPlayed) - startHole + 1
    if (holesCompleted <= 0) return

    const score = matchScore(startHole, endHole)
    const holesLeft = weightedHolesRemaining(Math.min(endHole, holesPlayed), endHole)
    const decided = Math.abs(score) > holesLeft
    const complete = holesPlayed >= endHole

    if (!decided && !complete) return

    if (score > 0) {
      w[p1.id] += amount
      w[p2.id] -= amount
    } else if (score < 0) {
      w[p1.id] -= amount
      w[p2.id] += amount
    }
  }

  settle(1, 9, stake)
  settle(10, 18, stake)
  settle(1, 18, stake)

  if (pressesAllowed) {
    let p1up = 0
    for (let h = 1; h <= Math.min(9, holesPlayed); h++) {
      const s1 = scoreMap[p1.id]?.[h]
      const s2 = scoreMap[p2.id]?.[h]
      if (s1 !== undefined && s2 !== undefined) {
        const m = holeMultipliers[h] ?? 1
        if (s1 < s2) p1up += m
        else if (s2 < s1) p1up -= m
      }
      if ((p1up <= -2 || p1up >= 2) && h < 9) {
        settle(h + 1, 9, stake)
        p1up = 0
      }
    }

    let p1upBack = 0
    for (let h = 10; h <= Math.min(18, holesPlayed); h++) {
      const s1 = scoreMap[p1.id]?.[h]
      const s2 = scoreMap[p2.id]?.[h]
      if (s1 !== undefined && s2 !== undefined) {
        const m = holeMultipliers[h] ?? 1
        if (s1 < s2) p1upBack += m
        else if (s2 < s1) p1upBack -= m
      }
      if ((p1upBack <= -2 || p1upBack >= 2) && h < 18) {
        settle(h + 1, 18, stake)
        p1upBack = 0
      }
    }
  }

  return w
}

// =====================
// MATCH PLAY
// Each hole counts as multiplier wins in the match tally.
// =====================
export function calculateMatchPlay(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings: Record<string, number> = {}
  players.forEach((p) => (winnings[p.id] = 0))

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i]
      const p2 = players[j]

      let p1up = 0
      for (let h = 1; h <= holesPlayed; h++) {
        const s1 = scoreMap[p1.id]?.[h]
        const s2 = scoreMap[p2.id]?.[h]
        if (s1 === undefined || s2 === undefined) continue
        const m = holeMultipliers[h] ?? 1
        if (s1 < s2) p1up += m
        else if (s2 < s1) p1up -= m
      }

      // Remaining weighted holes
      let holesLeft = 0
      for (let h = holesPlayed + 1; h <= 18; h++) holesLeft += holeMultipliers[h] ?? 1

      const decided = Math.abs(p1up) > holesLeft
      const complete = holesPlayed >= 18

      if (!decided && !complete) continue

      if (p1up > 0) {
        winnings[p1.id] += stake
        winnings[p2.id] -= stake
      } else if (p1up < 0) {
        winnings[p1.id] -= stake
        winnings[p2.id] += stake
      }
    }
  }

  return winnings
}

function calculateBanker(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings = initWinnings(players)

  for (let hole = 1; hole <= holesPlayed; hole++) {
    const holeScores = getCompletedHoleScores(players, scoreMap, hole)
    if (!holeScores) continue

    const banker = players[(hole - 1) % players.length]
    const bankerScore = scoreMap[banker.id]?.[hole]
    if (bankerScore === undefined) continue

    const unit = stake * (holeMultipliers[hole] ?? 1)
    const challengers = holeScores.filter((score) => score.id !== banker.id)
    const challengerMin = Math.min(...challengers.map((score) => score.strokes))

    if (bankerScore < challengerMin) {
      challengers.forEach((challenger) => {
        winnings[banker.id] += unit
        winnings[challenger.id] -= unit
      })
      continue
    }

    if (bankerScore > challengerMin) {
      challengers
        .filter((challenger) => challenger.strokes === challengerMin)
        .forEach((winner) => {
          winnings[winner.id] += unit
          winnings[banker.id] -= unit
        })
    }
  }

  return winnings
}

function calculateLeftRight(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings = initWinnings(players)

  for (let hole = 1; hole <= holesPlayed; hole++) {
    const holeScores = getCompletedHoleScores(players, scoreMap, hole)
    if (!holeScores) continue

    const minScore = Math.min(...holeScores.map((score) => score.strokes))
    const winners = holeScores.filter((score) => score.strokes === minScore)
    if (winners.length !== 1) continue

    const winnerIndex = players.findIndex((player) => player.id === winners[0].id)
    const leftNeighbor = players[(winnerIndex - 1 + players.length) % players.length]?.id
    const rightNeighbor = players[(winnerIndex + 1) % players.length]?.id
    const neighbors = Array.from(new Set([leftNeighbor, rightNeighbor].filter(Boolean))) as string[]
    const unit = stake * (holeMultipliers[hole] ?? 1)

    neighbors.forEach((neighborId) => {
      winnings[winners[0].id] += unit
      winnings[neighborId] -= unit
    })
  }

  return winnings
}

function calculateQuota(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holesPlayed: number
): Record<string, number> {
  const winnings = initWinnings(players)
  if (holesPlayed === 0) return winnings

  const totals = Object.fromEntries(players.map((player) => [
    player.id,
    Array.from({ length: holesPlayed }, (_, index) => scoreMap[player.id]?.[index + 1] ?? 0)
      .reduce((sum, value) => sum + value, 0) - ((player.handicap ?? 0) * holesPlayed) / 18,
  ]))

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i]
      const p2 = players[j]
      if (totals[p1.id] < totals[p2.id]) {
        winnings[p1.id] += stake
        winnings[p2.id] -= stake
      } else if (totals[p2.id] < totals[p1.id]) {
        winnings[p1.id] -= stake
        winnings[p2.id] += stake
      }
    }
  }

  return winnings
}

function calculateBestBall(
  players: Player[],
  scoreMap: ScoreMap,
  game: Game,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings = initWinnings(players)

  for (let hole = 1; hole <= holesPlayed; hole++) {
    const { A, B } = getTeamsForHole(game, hole, players)
    const teamAScores = getPlayerScoresForHole(A, scoreMap, hole)
    const teamBScores = getPlayerScoresForHole(B, scoreMap, hole)
    if (teamAScores.length !== A.length || teamBScores.length !== B.length || A.length === 0 || B.length === 0) continue

    const bestA = Math.min(...teamAScores)
    const bestB = Math.min(...teamBScores)
    if (bestA === bestB) continue

    settleTeamVsTeam(A, B, bestA < bestB ? 'A' : 'B', stake * (holeMultipliers[hole] ?? 1), winnings)
  }

  return winnings
}

function calculateVegas(
  players: Player[],
  scoreMap: ScoreMap,
  game: Game,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings = initWinnings(players)

  for (let hole = 1; hole <= holesPlayed; hole++) {
    const { A, B } = getTeamsForHole(game, hole, players)
    const teamAScores = getPlayerScoresForHole(A, scoreMap, hole).sort((a, b) => a - b)
    const teamBScores = getPlayerScoresForHole(B, scoreMap, hole).sort((a, b) => a - b)
    if (teamAScores.length !== 2 || teamBScores.length !== 2) continue

    const vegasA = teamAScores[0] * 10 + teamAScores[1]
    const vegasB = teamBScores[0] * 10 + teamBScores[1]
    if (vegasA === vegasB) continue

    settleTeamVsTeam(A, B, vegasA < vegasB ? 'A' : 'B', stake * (holeMultipliers[hole] ?? 1), winnings)
  }

  return winnings
}

function calculateWolf(
  players: Player[],
  scoreMap: ScoreMap,
  game: Game,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings = initWinnings(players)

  for (let hole = 1; hole <= holesPlayed; hole++) {
    const { A, B } = getTeamsForHole(game, hole, players)
    const teamAScores = getPlayerScoresForHole(A, scoreMap, hole)
    const teamBScores = getPlayerScoresForHole(B, scoreMap, hole)
    if (teamAScores.length !== A.length || teamBScores.length !== B.length || A.length === 0 || B.length === 0) continue

    const bestA = Math.min(...teamAScores)
    const bestB = Math.min(...teamBScores)
    if (bestA === bestB) continue

    const baseUnit = stake * (holeMultipliers[hole] ?? 1)
    const loneWolfTeam = A.length === 1 ? 'A' : B.length === 1 ? 'B' : null

    if (!loneWolfTeam) {
      settleTeamVsTeam(A, B, bestA < bestB ? 'A' : 'B', baseUnit, winnings)
      continue
    }

    const soloIds = loneWolfTeam === 'A' ? A : B
    const fieldIds = loneWolfTeam === 'A' ? B : A
    const soloWins = loneWolfTeam === 'A' ? bestA < bestB : bestB < bestA

    if (soloWins) {
      settleFlatBet(soloIds, fieldIds, baseUnit * 2 * fieldIds.length, winnings)
    } else {
      settleFlatBet(fieldIds, soloIds, baseUnit * 2 * fieldIds.length, winnings)
    }
  }

  return winnings
}

function calculateSixes(
  players: Player[],
  scoreMap: ScoreMap,
  game: Game,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number> = {}
): Record<string, number> {
  const winnings = initWinnings(players)
  const segments = [
    { start: 1, end: 6 },
    { start: 7, end: 12 },
    { start: 13, end: 18 },
  ]

  for (const segment of segments) {
    let aPoints = 0
    let bPoints = 0
    let anyCompleted = false

    for (let hole = segment.start; hole <= Math.min(segment.end, holesPlayed); hole++) {
      const { A, B } = getTeamsForHole(game, hole, players)
      const teamAScores = getPlayerScoresForHole(A, scoreMap, hole)
      const teamBScores = getPlayerScoresForHole(B, scoreMap, hole)
      if (teamAScores.length !== A.length || teamBScores.length !== B.length || A.length === 0 || B.length === 0) continue

      anyCompleted = true
      const bestA = Math.min(...teamAScores)
      const bestB = Math.min(...teamBScores)
      const weight = holeMultipliers[hole] ?? 1

      if (bestA < bestB) aPoints += weight
      else if (bestB < bestA) bPoints += weight
    }

    if (!anyCompleted || aPoints === bPoints) continue

    const { A, B } = getTeamsForHole(game, segment.start, players)
    settleTeamVsTeam(A, B, aPoints > bPoints ? 'A' : 'B', stake, winnings)
  }

  return winnings
}

function calculateCustomHoleByHole(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holesPlayed: number,
  holeMultipliers: Record<number, number>,
  engine: CustomGameEngine
): Record<string, number> {
  const winnings: Record<string, number> = {}
  players.forEach((player) => { winnings[player.id] = 0 })

  const tiePolicy = engine.tie_policy ?? 'push'
  const matchup = engine.matchup ?? 'all_players'

  if (matchup === 'pairwise') {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i]
        const p2 = players[j]
        let carried = 0

        for (let hole = 1; hole <= holesPlayed; hole++) {
          const s1 = scoreMap[p1.id]?.[hole]
          const s2 = scoreMap[p2.id]?.[hole]
          if (s1 === undefined || s2 === undefined) continue

          const unit = stake * (holeMultipliers[hole] ?? 1)
          if (s1 === s2) {
            if (tiePolicy === 'carry') carried += unit
            continue
          }

          const amount = unit + carried
          carried = 0
          if (s1 < s2) {
            winnings[p1.id] += amount
            winnings[p2.id] -= amount
          } else {
            winnings[p1.id] -= amount
            winnings[p2.id] += amount
          }
        }
      }
    }

    return winnings
  }

  let carried = 0

  for (let hole = 1; hole <= holesPlayed; hole++) {
    const holeScores = getCompletedHoleScores(players, scoreMap, hole)
    if (!holeScores) continue

    const minScore = Math.min(...holeScores.map((entry) => entry.strokes))
    const winners = holeScores.filter((entry) => entry.strokes === minScore)
    const unit = stake * (holeMultipliers[hole] ?? 1)

    if (winners.length > 1) {
      if (tiePolicy === 'carry') carried += unit
      if (tiePolicy === 'split') {
        const sharedValue = unit / winners.length
        for (const winner of winners) {
          winnings[winner.id] += sharedValue * (players.length - winners.length)
        }
        for (const player of players) {
          if (!winners.some((winner) => winner.id === player.id)) {
            winnings[player.id] -= unit
          }
        }
      }
      continue
    }

    const totalValue = unit + carried
    carried = 0
    const winnerId = winners[0].id

    winnings[winnerId] += totalValue * (players.length - 1)
    for (const player of players) {
      if (player.id !== winnerId) winnings[player.id] -= totalValue
    }
  }

  return winnings
}

function settleHeadToHeadRange(
  p1: Player,
  p2: Player,
  scoreMap: ScoreMap,
  startHole: number,
  endHole: number,
  stake: number,
  holeMultipliers: Record<number, number>,
  tiePolicy: CustomGameEngine['tie_policy']
): Record<string, number> {
  const result: Record<string, number> = { [p1.id]: 0, [p2.id]: 0 }
  let p1Advantage = 0
  let weightedPlayed = 0
  let weightedRemaining = 0

  for (let hole = startHole; hole <= endHole; hole++) {
    const weight = holeMultipliers[hole] ?? 1
    const s1 = scoreMap[p1.id]?.[hole]
    const s2 = scoreMap[p2.id]?.[hole]
    if (s1 === undefined || s2 === undefined) {
      weightedRemaining += weight
      continue
    }

    weightedPlayed += weight
    if (s1 < s2) p1Advantage += weight
    else if (s2 < s1) p1Advantage -= weight
  }

  const completed = weightedPlayed > 0 && weightedRemaining === 0
  const decided = Math.abs(p1Advantage) > weightedRemaining
  if (!completed && !decided) return result

  if (p1Advantage > 0) {
    result[p1.id] += stake
    result[p2.id] -= stake
  } else if (p1Advantage < 0) {
    result[p1.id] -= stake
    result[p2.id] += stake
  } else if (tiePolicy === 'split' || tiePolicy === 'halve') {
    return result
  }

  return result
}

function calculateCustomMatchPlay(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holeMultipliers: Record<number, number>,
  engine: CustomGameEngine
): Record<string, number> {
  const winnings: Record<string, number> = {}
  players.forEach((player) => { winnings[player.id] = 0 })

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      mergeWinnings(
        winnings,
        settleHeadToHeadRange(
          players[i],
          players[j],
          scoreMap,
          1,
          18,
          stake,
          holeMultipliers,
          engine.tie_policy ?? 'halve'
        )
      )
    }
  }

  return winnings
}

function calculateCustomSegmentMatch(
  players: Player[],
  scoreMap: ScoreMap,
  stake: number,
  holeMultipliers: Record<number, number>,
  engine: CustomGameEngine
): Record<string, number> {
  const winnings: Record<string, number> = {}
  players.forEach((player) => { winnings[player.id] = 0 })

  const segments = engine.segments?.length
    ? engine.segments
    : [
        { label: 'Front 9', start_hole: 1, end_hole: 9, stake_multiplier: 1 },
        { label: 'Back 9', start_hole: 10, end_hole: 18, stake_multiplier: 1 },
        { label: 'Overall', start_hole: 1, end_hole: 18, stake_multiplier: 1 },
      ]

  for (const segment of segments) {
    const segmentStake = stake * (segment.stake_multiplier ?? 1)
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        mergeWinnings(
          winnings,
          settleHeadToHeadRange(
            players[i],
            players[j],
            scoreMap,
            segment.start_hole,
            segment.end_hole,
            segmentStake,
            holeMultipliers,
            engine.tie_policy ?? 'halve'
          )
        )
      }
    }
  }

  return winnings
}

function calculateCustomGame(
  players: Player[],
  scoreMap: ScoreMap,
  game: Game,
  holesPlayed: number,
  holeMultipliers: Record<number, number>
): Record<string, number> {
  const engine = getCustomEngine(game)

  switch (engine.mode) {
    case 'match_play':
      return calculateCustomMatchPlay(players, scoreMap, game.stake, holeMultipliers, engine)
    case 'segment_match':
      return calculateCustomSegmentMatch(players, scoreMap, game.stake, holeMultipliers, engine)
    case 'hole_by_hole':
    default:
      return calculateCustomHoleByHole(players, scoreMap, game.stake, holesPlayed, holeMultipliers, engine)
  }
}

// =====================
// COMBINED LEADERBOARD
// =====================
export function calculateLeaderboard(
  players: Player[],
  scores: Score[],
  games: Game[],
  holeMultipliers: Record<number, number> = {}
): LeaderboardEntry[] {
  const scoreMap = buildScoreMap(scores)
  const holesPlayed = scores.length > 0
    ? Math.max(...scores.map((s) => s.hole_number))
    : 0

  const totals: Record<string, number> = {}
  const breakdown: Record<string, Record<string, number>> = {}
  players.forEach((p) => {
    totals[p.id] = 0
    breakdown[p.id] = {}
  })

  for (const game of games) {
    let result: Record<string, number> = {}

    switch (game.game_type) {
      case 'skins':
        result = calculateSkins(players, scoreMap, game.stake, holesPlayed, holeMultipliers)
        break
      case 'nassau':
        result = calculateNassau(
          players,
          scoreMap,
          game.stake,
          (game.rules_json as { presses_allowed?: boolean }).presses_allowed ?? false,
          holesPlayed,
          holeMultipliers
        )
        break
      case 'match_play':
        result = calculateMatchPlay(players, scoreMap, game.stake, holesPlayed, holeMultipliers)
        break
      case 'banker':
        result = calculateBanker(players, scoreMap, game.stake, holesPlayed, holeMultipliers)
        break
      case 'left_right':
        result = calculateLeftRight(players, scoreMap, game.stake, holesPlayed, holeMultipliers)
        break
      case 'quota':
        result = calculateQuota(players, scoreMap, game.stake, holesPlayed)
        break
      case 'best_ball':
        result = calculateBestBall(players, scoreMap, game, game.stake, holesPlayed, holeMultipliers)
        break
      case 'vegas':
        result = calculateVegas(players, scoreMap, game, game.stake, holesPlayed, holeMultipliers)
        break
      case 'wolf':
        result = calculateWolf(players, scoreMap, game, game.stake, holesPlayed, holeMultipliers)
        break
      case 'sixes':
        result = calculateSixes(players, scoreMap, game, game.stake, holesPlayed, holeMultipliers)
        break
      case 'custom':
        result = calculateCustomGame(players, scoreMap, game, holesPlayed, holeMultipliers)
        break
      default:
        break
    }

    for (const player of players) {
      const amount = result[player.id] ?? 0
      totals[player.id] += amount
      if (amount !== 0) {
        const label = game.name || game.game_type
        breakdown[player.id][label] =
          (breakdown[player.id][label] ?? 0) + amount
      }
    }
  }

  return players
    .map((player) => ({
      player,
      total: parseFloat(totals[player.id].toFixed(2)),
      breakdown: Object.fromEntries(
        Object.entries(breakdown[player.id]).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
      ),
    }))
    .sort((a, b) => b.total - a.total)
}
