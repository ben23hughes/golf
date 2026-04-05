export type User = {
  id: string
  name: string
  username: string
  email: string
  avatar_url?: string | null
  handicap: number | null
  ghin_number: string | null
  created_at: string
}

export type Round = {
  id: string
  course_name: string
  date: string
  tee_box: string
  created_by: string
  status: 'active' | 'completed'
  created_at: string
}

export type Player = {
  id: string
  round_id: string
  user_id: string | null
  name: string
  handicap: number | null
}

export type Score = {
  id: string
  round_id: string
  player_id: string
  hole_number: number
  strokes: number
}

export type GameType =
  | 'skins'
  | 'nassau'
  | 'match_play'
  | 'wolf'
  | 'vegas'
  | 'sixes'
  | 'quota'
  | 'best_ball'
  | 'left_right'
  | 'banker'
  | 'custom'

export type Game = {
  id: string
  round_id: string
  name: string
  game_type: GameType
  stake: number
  rules_json: Record<string, unknown>
}

export type GameTemplate = {
  id: string
  user_id: string
  name: string
  games_json: Game[]
  created_at: string
}

export type PlayerWithScores = Player & {
  scores: Score[]
}

export type LeaderboardEntry = {
  player: Player
  total: number
  breakdown: Record<string, number>
}
