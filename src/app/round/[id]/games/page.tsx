'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import type { Player } from '@/types'

type PresetGame = {
  type: string
  label: string
  description: string
  stakePlaceholder: string
  handicapMode?: 'gross' | 'handicap'
  trackingNote?: string
  extraFields?: { key: string; label: string; type: 'checkbox' }[]
  supportsTeams?: boolean
  supportsHoleTeamChanges?: boolean
}

const PRESET_GAMES: PresetGame[] = [
  { type: 'skins', label: 'Skins', description: 'Gross skins: one outright low score wins the hole, and ties carry to the next one.', stakePlaceholder: '2', handicapMode: 'gross', trackingNote: 'Tracks outright hole winners only. No net skins or special carry variants.' },
  { type: 'nassau', label: 'Nassau', description: 'Three match bets: front 9, back 9, and overall. Automatic presses are optional.', stakePlaceholder: '5', handicapMode: 'gross', trackingNote: 'Tracks the core Nassau bets. Presses here are simplified automatic presses only.', extraFields: [{ key: 'presses_allowed', label: 'Automatic presses', type: 'checkbox' }] },
  { type: 'match_play', label: 'Match Play', description: 'Pairwise hole match scoring across the field. Most holes won takes the bet.', stakePlaceholder: '10', handicapMode: 'gross', trackingNote: 'Tracks gross match-play results only.' },
  { type: 'wolf', label: 'Wolf', description: 'Core Wolf scoring with hole-by-hole teams. Solo wolf holes pay like a bigger bet.', stakePlaceholder: '2', handicapMode: 'gross', trackingNote: 'Tracks selected teams and solo wolf payouts. Blind wolf timing and house-rule doubles are not tracked.', supportsTeams: true, supportsHoleTeamChanges: true },
  { type: 'vegas', label: 'Vegas', description: '2v2 only. Each team combines its low and high gross scores into a two-digit Vegas number.', stakePlaceholder: '1', handicapMode: 'gross', trackingNote: 'Tracks the standard simple Vegas number game. No score-flip or custom multiplier variants.', supportsTeams: true },
  { type: 'sixes', label: 'Sixes Team Rotation', description: '4-player rotation game. Teams can change by segment, and each six-hole block settles separately.', stakePlaceholder: '5', handicapMode: 'gross', trackingNote: 'This is the 4-player rotating-team version, not the 3-player split-sixes points game.', supportsTeams: true, supportsHoleTeamChanges: true },
  { type: 'quota', label: 'Quota (Simplified)', description: 'Simplified quota-style race using total strokes adjusted by handicap.', stakePlaceholder: '1', handicapMode: 'handicap', trackingNote: 'This app does not track full par-based quota points, so this version is only a simplified handicap-adjusted strokes race.' },
  { type: 'best_ball', label: 'Best Ball', description: 'Gross team best ball. The low score on each team is the team score for that hole.', stakePlaceholder: '5', handicapMode: 'gross', trackingNote: 'Tracks gross best ball only.' , supportsTeams: true },
  { type: 'left_right', label: 'Left Right', description: '4-player four-ball match with teams that can switch every hole.', stakePlaceholder: '2', handicapMode: 'gross', trackingNote: 'Tracks the team-switching version. Set the teams for each hole manually in the app; left/right tee-shot positions are not detected automatically.', supportsTeams: true, supportsHoleTeamChanges: true },
  { type: 'banker', label: 'Banker', description: 'The banker rotates by hole and plays the field. Anyone tying the banker pushes; anyone beating the banker gets paid.', stakePlaceholder: '2', handicapMode: 'gross', trackingNote: 'Tracks the rotating-banker core game without extra presses or side rules.' },
]

type SelectedGame = {
  name: string
  type: string
  stake: string
  rules_json: Record<string, unknown>
}

type AiResponse =
  | { status: 'needs_clarification'; question: string }
  | {
      status: 'ready'
      game: {
        type: 'custom'
        name_suggestion?: string
        summary?: string
        stake?: number
        rules?: Record<string, unknown>
      }
    }

type AiTurn = {
  question: string
  answer: string
}

type CustomBuilderMode = 'hole_by_hole' | 'match_play' | 'segment_match'
type CustomBuilderMatchup = 'all_players' | 'pairwise'
type CustomBuilderTiePolicy = 'carry' | 'push' | 'halve' | 'split'
type CustomBuilderPayout = 'winner_takes_from_all' | 'flat_match_bet'

type SavedTemplate = {
  id: string
  name: string
  games_json: SelectedGame[]
  user_id?: string
  creator_name?: string
}

type TeamAssignments = Record<string, { A: string[]; B: string[] }>

function createDefaultTeams(players: Player[]): { A: string[]; B: string[] } {
  const A: string[] = []
  const B: string[] = []

  players.forEach((player, index) => {
    if (index % 2 === 0) A.push(player.id)
    else B.push(player.id)
  })

  return { A, B }
}

function buildHoleAssignments(players: Player[]): TeamAssignments {
  const base = createDefaultTeams(players)
  return Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => [String(index + 1), { A: [...base.A], B: [...base.B] }])
  )
}

export default function GamesPage() {
  const { id: roundId } = useParams<{ id: string }>()
  const router = useRouter()

  const [tab, setTab] = useState<'preset' | 'ai'>('preset')
  const [players, setPlayers] = useState<Player[]>([])
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [friendTemplates, setFriendTemplates] = useState<SavedTemplate[]>([])
  const [expandedInfo, setExpandedInfo] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<SelectedGame | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const [error, setError] = useState('')

  // AI builder
  const [aiInput, setAiInput] = useState('')
  const [aiTurns, setAiTurns] = useState<AiTurn[]>([])
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnswerInput, setAiAnswerInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<SelectedGame | null>(null)
  const [aiError, setAiError] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateMessage, setTemplateMessage] = useState('')
  const [builderName, setBuilderName] = useState('Custom Game')
  const [builderStake, setBuilderStake] = useState('10')
  const [builderMode, setBuilderMode] = useState<CustomBuilderMode>('hole_by_hole')
  const [builderMatchup, setBuilderMatchup] = useState<CustomBuilderMatchup>('all_players')
  const [builderTiePolicy, setBuilderTiePolicy] = useState<CustomBuilderTiePolicy>('carry')
  const [builderPayout, setBuilderPayout] = useState<CustomBuilderPayout>('winner_takes_from_all')
  const [builderTeamPlay, setBuilderTeamPlay] = useState(false)
  const [builderAllowTeamChanges, setBuilderAllowTeamChanges] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function loadTemplates() {
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('round_id', roundId)
        .order('created_at')

      setPlayers((playersData as Player[] | null) ?? [])

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('game_templates')
        .select('id, name, games_json')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setSavedTemplates((data as SavedTemplate[] | null) ?? [])

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted')

      const friendIds = (friendships ?? []).map((friendship) =>
        friendship.requester_id === user.id ? friendship.addressee_id : friendship.requester_id
      )

      if (friendIds.length === 0) {
        setFriendTemplates([])
        return
      }

      const [{ data: templatesData }, { data: profilesData }] = await Promise.all([
        supabase
          .from('game_templates')
          .select('id, user_id, name, games_json')
          .in('user_id', friendIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, name')
          .in('id', friendIds),
      ])

      const profileNameById = new Map((profilesData ?? []).map((profile) => [profile.id, profile.name]))
      const hydratedTemplates = ((templatesData as SavedTemplate[] | null) ?? []).map((template) => ({
        ...template,
        creator_name: template.user_id ? profileNameById.get(template.user_id) ?? 'Friend' : 'Friend',
      }))

      setFriendTemplates(hydratedTemplates)
    }

    void loadTemplates()
  }, [roundId])

  function selectGame(preset: PresetGame) {
    if (selected?.type === preset.type) {
      setSelected(null)
      setSelectedTemplateId(null)
      setTemplateNameInput('')
    } else {
      const baseRules: Record<string, unknown> = {}

      if (preset.supportsTeams) {
        baseRules.team_play = true
        baseRules.allow_team_changes = !!preset.supportsHoleTeamChanges
        baseRules.team_assignments = buildHoleAssignments(players)
      }

      setSelected({ name: preset.label, type: preset.type, stake: preset.stakePlaceholder, rules_json: baseRules })
      setSelectedTemplateId(null)
      setTemplateNameInput('')
    }
  }

  function selectSavedTemplate(template: SavedTemplate) {
    const [firstGame] = template.games_json ?? []
    if (!firstGame) return
    setSelected(firstGame)
    setSelectedTemplateId(template.id)
    setTemplateNameInput(template.name)
  }

  function toggleInfo(key: string) {
    setExpandedInfo((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function updateStake(stake: string) {
    if (selected) setSelected({ ...selected, stake })
  }

  function updateRule(key: string, value: unknown) {
    if (selected) setSelected({ ...selected, rules_json: { ...selected.rules_json, [key]: value } })
  }

  function updateTeamAssignments(nextAssignments: TeamAssignments) {
    if (!selected) return
    setSelected({
      ...selected,
      rules_json: {
        ...selected.rules_json,
        team_play: true,
        team_assignments: nextAssignments,
      },
    })
  }

  function movePlayerToTeam(playerId: string, team: 'A' | 'B') {
    if (!selected) return

    const assignments = (selected.rules_json.team_assignments as TeamAssignments | undefined) ?? buildHoleAssignments(players)
    const nextAssignments = Object.fromEntries(
      Object.entries(assignments).map(([hole, value]) => {
        const nextA = value.A.filter((id) => id !== playerId)
        const nextB = value.B.filter((id) => id !== playerId)
        if (team === 'A') nextA.push(playerId)
        else nextB.push(playerId)
        return [hole, { A: nextA, B: nextB }]
      })
    ) as TeamAssignments

    updateTeamAssignments(nextAssignments)
  }

function formatRuleValue(value: unknown) {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }

  return String(value)
}

  async function generateWithAI(turnsOverride?: AiTurn[]) {
    if (!aiInput.trim()) return
    setAiLoading(true)
    setAiError('')

    try {
      const res = await fetch('/api/generate-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: aiInput,
          turns: turnsOverride ?? aiTurns,
        }),
      })
      const data = (await res.json()) as AiResponse | { error?: string }
      if (!res.ok) {
        throw new Error('error' in data ? data.error ?? 'Failed to generate' : 'Failed to generate')
      }

      if ('status' in data && data.status === 'needs_clarification') {
        setAiQuestion(data.question)
        setAiResult(null)
      } else if ('status' in data && data.status === 'ready') {
        const first = data.game
        setAiResult({
          name: first.name_suggestion ?? first.type.replace(/_/g, ' '),
          type: first.type,
          stake: String(first.stake ?? '5'),
          rules_json: {
            summary: first.summary ?? '',
            engine: first.rules ?? {},
          },
        })
        setAiQuestion('')
        setAiAnswerInput('')
      }
    } catch (e) {
      setAiError((e as Error).message)
    }
    setAiLoading(false)
  }

  async function submitAiAnswer() {
    const answer = aiAnswerInput.trim()
    if (!answer || !aiQuestion.trim()) return
    const nextTurns = [...aiTurns, { question: aiQuestion, answer }]
    setAiTurns(nextTurns)
    setAiAnswerInput('')
    await generateWithAI(nextTurns)
  }

  async function saveSelectedGame(game: SelectedGame | null) {
    if (!game) {
      router.push(`/round/${roundId}/scorecard`)
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('games').insert({
      round_id: roundId,
      name: game.name.trim() || game.type.replace(/_/g, ' '),
      game_type: game.type,
      stake: parseFloat(game.stake) || 0,
      rules_json: game.rules_json,
    })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    router.push(`/round/${roundId}/scorecard`)
  }

  async function saveAiTemplate() {
    if (!aiResult) return
    await saveTemplate(aiResult, 'Saved to your game modes.')
  }

  async function handleSave() {
    await saveSelectedGame(selected)
  }

  async function handleQuit() {
    const confirmed = window.confirm('Quit this round setup? The round and players will be deleted.')
    if (!confirmed) return

    setError('')
    setQuitting(true)

    const supabase = createClient()
    const { error: deleteError } = await supabase.from('rounds').delete().eq('id', roundId)

    if (deleteError) {
      setError(deleteError.message)
      setQuitting(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  function buildManualGame(): SelectedGame {
    const rules: Record<string, unknown> = {
      summary: `Custom ${builderMode.replace(/_/g, ' ')} game at $${builderStake || '0'} per player.`,
      engine: {
        mode: builderMode,
        matchup: builderMatchup,
        scoring: 'low_score',
        tie_policy: builderTiePolicy,
        payout_style: builderPayout,
        ...(builderMode === 'segment_match'
          ? {
              segments: [
                { label: 'Front 9', start_hole: 1, end_hole: 9, stake_multiplier: 1 },
                { label: 'Back 9', start_hole: 10, end_hole: 18, stake_multiplier: 1 },
                { label: 'Overall', start_hole: 1, end_hole: 18, stake_multiplier: 1 },
              ],
            }
          : {}),
      },
    }

    if (builderTeamPlay) {
      rules.team_play = true
      rules.allow_team_changes = builderAllowTeamChanges
      rules.team_assignments = buildHoleAssignments(players)
    }

    return {
      name: builderName.trim() || 'Custom Game',
      type: 'custom',
      stake: builderStake || '0',
      rules_json: rules,
    }
  }

  async function saveTemplate(game: SelectedGame, successMessage: string) {
    setTemplateSaving(true)
    setTemplateMessage('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setTemplateMessage('Sign in to save game modes.')
      setTemplateSaving(false)
      return
    }

    const payload = {
      user_id: user.id,
      name: game.name.trim() || 'Custom Game',
      games_json: [game],
    }

    const { data, error: templateError } = await supabase
      .from('game_templates')
      .insert(payload)
      .select('id, name, games_json')
      .single()

    if (templateError) {
      setTemplateMessage(templateError.message)
      setTemplateSaving(false)
      return
    }

    if (data) {
      setSavedTemplates((prev) => [data as SavedTemplate, ...prev])
    }

    setTemplateMessage(successMessage)
    setTemplateSaving(false)
  }

  async function renameSavedTemplate() {
    if (!selectedTemplateId || !templateNameInput.trim()) return

    const supabase = createClient()
    const { error: templateError } = await supabase
      .from('game_templates')
      .update({ name: templateNameInput.trim() })
      .eq('id', selectedTemplateId)

    if (templateError) {
      setError(templateError.message)
      return
    }

    setSavedTemplates((prev) =>
      prev.map((template) =>
        template.id === selectedTemplateId
          ? { ...template, name: templateNameInput.trim() }
          : template
      )
    )
    setSelected((prev) => (prev ? { ...prev, name: templateNameInput.trim() } : prev))
  }

  async function deleteSavedTemplate() {
    if (!selectedTemplateId) return

    const supabase = createClient()
    const { error: templateError } = await supabase
      .from('game_templates')
      .delete()
      .eq('id', selectedTemplateId)

    if (templateError) {
      setError(templateError.message)
      return
    }

    setSavedTemplates((prev) => prev.filter((template) => template.id !== selectedTemplateId))
    setSelectedTemplateId(null)
    setTemplateNameInput('')
    setSelected(null)
  }

  const selectedPreset = PRESET_GAMES.find((p) => p.type === selected?.type)
  const teamAssignments = (selected?.rules_json.team_assignments as TeamAssignments | undefined) ?? buildHoleAssignments(players)
  const firstHoleTeams = teamAssignments['1'] ?? createDefaultTeams(players)

  return (
    <AppShell
      title="Choose a Game"
      eyebrow="Round Setup"
      description="Pick a standard format or let AI turn plain English into a custom setup."
      backHref="/round/create"
      activeTab={false}
    >
      <div className="space-y-4">
        <div className="surface-card-strong grid grid-cols-2 gap-2 p-2">
          <button
            onClick={() => setTab('preset')}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              tab === 'preset' ? 'bg-[#174c38] text-[#f8f3e9]' : 'text-[#536153]'
            }`}
          >
            Games
          </button>
          <button
            onClick={() => setTab('ai')}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              tab === 'ai' ? 'bg-[#174c38] text-[#f8f3e9]' : 'text-[#536153]'
            }`}
          >
            AI Builder
          </button>
        </div>

        {tab === 'preset' && (
          <div className="space-y-3">
            {savedTemplates.length > 0 && (
              <div className="space-y-3">
                <div className="px-1">
                  <p className="section-label">Saved Modes</p>
                </div>
                {savedTemplates.map((template) => {
                  const firstGame = template.games_json?.[0]
                  if (!firstGame) return null
                  const isSelected = selected?.name === firstGame.name && selected?.type === firstGame.type

                  return (
                    <div
                      key={template.id}
                      className={`surface-card-strong px-4 py-4 transition ${isSelected ? 'ring-2 ring-[#174c38]/25' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => selectSavedTemplate(template)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#112218]">{template.name}</p>
                            <p className="mt-1 text-xs text-[#5a6758]">
                              Created by You · {firstGame.type.replace(/_/g, ' ')} · ${firstGame.stake}/player
                            </p>
                          </div>
                          <span className="status-chip bg-[#dce8df] text-[#174c38]">Saved</span>
                        </div>
                      </button>
                      {isSelected && (
                        <button
                          type="button"
                          onClick={() => toggleInfo(`template-${template.id}`)}
                          className="mt-3 text-sm font-semibold text-[#174c38]"
                        >
                          {expandedInfo[`template-${template.id}`] ? 'Hide Info' : 'More Info'}
                        </button>
                      )}
                      {isSelected && expandedInfo[`template-${template.id}`] && (
                        <div className="mt-3 rounded-2xl bg-[#f8f3e9] px-3 py-3 text-sm text-[#536153]">
                          {typeof firstGame.rules_json.summary === 'string' && firstGame.rules_json.summary
                            ? firstGame.rules_json.summary
                            : 'Saved custom setup ready to reuse.'}
                        </div>
                      )}
                      {isSelected && selectedTemplateId === template.id && (
                        <div className="mt-3 space-y-3 rounded-2xl border border-[rgba(17,34,24,0.08)] bg-[#fffdf8] p-3">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5a6758]">
                              Rename Game Mode
                            </label>
                            <input
                              type="text"
                              value={templateNameInput}
                              onChange={(e) => setTemplateNameInput(e.target.value)}
                              className="app-input px-3 py-2.5 text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void renameSavedTemplate()}
                              className="secondary-button flex-1"
                            >
                              Save Name
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteSavedTemplate()}
                              className="rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#a34d2d]"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {friendTemplates.length > 0 && (
              <div className="space-y-3">
                <div className="px-1">
                  <p className="section-label">Games Made By Friends</p>
                </div>
                {friendTemplates.map((template) => {
                  const firstGame = template.games_json?.[0]
                  if (!firstGame) return null
                  const isSelected = selected?.name === firstGame.name && selected?.type === firstGame.type

                  return (
                    <div
                      key={template.id}
                      className={`surface-card-strong px-4 py-4 transition ${isSelected ? 'ring-2 ring-[#174c38]/25' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => selectSavedTemplate(template)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#112218]">{template.name}</p>
                            <p className="mt-1 text-xs text-[#5a6758]">
                              Created by {template.creator_name ?? 'Friend'} · {firstGame.type.replace(/_/g, ' ')} · ${firstGame.stake}/player
                            </p>
                          </div>
                          <span className="status-chip bg-[#ece5d6] text-[#6f695a]">Friend</span>
                        </div>
                      </button>
                      {isSelected && (
                        <button
                          type="button"
                          onClick={() => toggleInfo(`friend-template-${template.id}`)}
                          className="mt-3 text-sm font-semibold text-[#174c38]"
                        >
                          {expandedInfo[`friend-template-${template.id}`] ? 'Hide Info' : 'More Info'}
                        </button>
                      )}
                      {isSelected && expandedInfo[`friend-template-${template.id}`] && (
                        <div className="mt-3 rounded-2xl bg-[#f8f3e9] px-3 py-3 text-sm text-[#536153]">
                          {typeof firstGame.rules_json.summary === 'string' && firstGame.rules_json.summary
                            ? firstGame.rules_json.summary
                            : 'Friend-made setup ready to reuse.'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {PRESET_GAMES.map((preset) => {
              const isSelected = selected?.type === preset.type
              return (
                <div
                  key={preset.type}
                  className={`surface-card-strong transition ${isSelected ? 'ring-2 ring-[#174c38]/25' : ''}`}
                >
                  <div className="px-4 py-4">
                    <button
                      onClick={() => selectGame(preset)}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#112218]">{preset.label}</p>
                        <p className="mt-1 text-xs text-[#5a6758]">
                          ${preset.stakePlaceholder}/player default
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`status-chip ${preset.handicapMode === 'handicap' ? 'bg-[#ece5d6] text-[#6f695a]' : 'bg-[#dce8df] text-[#174c38]'}`}>
                            {preset.handicapMode === 'handicap' ? 'Uses Handicap' : 'Gross Only'}
                          </span>
                          {preset.supportsTeams && (
                            <span className="status-chip bg-[#f3ede2] text-[#6f695a]">Team Game</span>
                          )}
                        </div>
                      </div>
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
                        isSelected ? 'border-[#174c38] bg-[#174c38]' : 'border-[rgba(17,34,24,0.14)]'
                      }`}>
                        {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                    </button>
                    {isSelected && (
                      <button
                        type="button"
                        onClick={() => toggleInfo(preset.type)}
                        className="mt-3 text-sm font-semibold text-[#174c38]"
                      >
                        {expandedInfo[preset.type] ? 'Hide Info' : 'More Info'}
                      </button>
                    )}
                    {isSelected && expandedInfo[preset.type] && (
                      <div className="mt-3 rounded-2xl bg-[#f8f3e9] px-3 py-3 text-sm text-[#536153]">
                        <p>{preset.description}</p>
                        {preset.trackingNote && (
                          <p className="mt-2 text-xs leading-5 text-[#6f695a]">
                            {preset.trackingNote}
                          </p>
                        )}
                        {preset.supportsTeams && (
                          <p className="mt-2">
                            Team game
                            {preset.supportsHoleTeamChanges ? ' with optional team changes by hole.' : ' with fixed team setup.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {isSelected && selectedPreset && (
                    <div className="space-y-3 border-t border-[rgba(17,34,24,0.08)] px-4 pb-4 pt-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-[#536153]">Stake per player</label>
                        <div className="flex items-center overflow-hidden rounded-xl border border-[rgba(17,34,24,0.1)] bg-[#fffdf8]">
                          <span className="px-3 text-sm text-[#5a6758]">$</span>
                          <input
                            type="number"
                            value={selected.stake}
                            onChange={(e) => updateStake(e.target.value)}
                            min={0}
                            step={1}
                            className="w-16 bg-transparent py-2.5 pr-3 text-base font-medium focus:outline-none"
                          />
                        </div>
                      </div>
                      {selectedPreset.extraFields?.map((field) => (
                        <label key={field.key} className="flex items-center gap-3 text-sm text-[#314131]">
                          <input
                            type="checkbox"
                            checked={!!(selected.rules_json[field.key])}
                            onChange={(e) => updateRule(field.key, e.target.checked)}
                            className="h-5 w-5 accent-[#174c38]"
                          />
                          {field.label}
                        </label>
                      ))}
                      {selectedPreset.supportsTeams && players.length > 1 && (
                        <div className="space-y-3 rounded-2xl border border-[rgba(17,34,24,0.08)] bg-[#f8f3e9] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[#112218]">Teams</p>
                              <p className="text-xs text-[#5a6758]">
                                {selectedPreset.supportsHoleTeamChanges
                                  ? 'These teams can also be changed hole by hole during the round.'
                                  : 'Fixed teams for the full round.'}
                              </p>
                            </div>
                            {selectedPreset.supportsHoleTeamChanges && (
                              <label className="flex items-center gap-2 text-xs font-medium text-[#314131]">
                                <input
                                  type="checkbox"
                                  checked={!!selected.rules_json.allow_team_changes}
                                  onChange={(e) => updateRule('allow_team_changes', e.target.checked)}
                                  className="h-4 w-4 accent-[#174c38]"
                                />
                                Change by hole
                              </label>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6758]">Team A</p>
                              <div className="mt-2 space-y-2">
                                {players.map((player) => (
                                  <button
                                    key={`${player.id}-A`}
                                    type="button"
                                    onClick={() => movePlayerToTeam(player.id, 'A')}
                                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                                      firstHoleTeams.A.includes(player.id)
                                        ? 'bg-[#174c38] text-[#f8f3e9]'
                                        : 'bg-[#ece5d6] text-[#536153]'
                                    }`}
                                  >
                                    {player.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6758]">Team B</p>
                              <div className="mt-2 space-y-2">
                                {players.map((player) => (
                                  <button
                                    key={`${player.id}-B`}
                                    type="button"
                                    onClick={() => movePlayerToTeam(player.id, 'B')}
                                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                                      firstHoleTeams.B.includes(player.id)
                                        ? 'bg-[#174c38] text-[#f8f3e9]'
                                        : 'bg-[#ece5d6] text-[#536153]'
                                    }`}
                                  >
                                    {player.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <p className="px-1 text-xs leading-5 text-[#6f695a]">
              * Gross Only means the app scores raw strokes only, with no handicap or net-stroke adjustment. Uses Handicap means handicap is factored into that mode&apos;s scoring.
            </p>
          </div>
        )}

        {tab === 'ai' && (
          <div className="space-y-4">
            <div className="surface-card-strong px-5 py-5">
              <h2 className="font-serif text-2xl font-semibold text-[#112218]">AI Game Builder</h2>
              <p className="mt-2 text-sm leading-6 text-[#5a6758]">Describe the type of game you want to play and AI will make it for you.</p>
            </div>

            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="2v2 game 10 dollars a hole"
              rows={4}
              className="app-input resize-none"
            />

            <button
              disabled={!aiInput.trim() || aiLoading}
              onClick={() => {
                setAiTurns([])
                setAiQuestion('')
                setAiAnswerInput('')
                setAiResult(null)
                void generateWithAI([])
              }}
              className="primary-button w-full disabled:opacity-40"
            >
              {aiLoading ? 'Generating…' : 'Generate Custom Game'}
            </button>

            <div className="surface-card space-y-4 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-[#112218]">Build Without AI</p>
                <p className="mt-1 text-sm text-[#5a6758]">
                  Set the rules directly with quick options.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#5a6758]">
                  Game Name
                </label>
                <input
                  type="text"
                  value={builderName}
                  onChange={(e) => setBuilderName(e.target.value)}
                  className="app-input"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#5a6758]">
                  Stake Per Player
                </label>
                <input
                  type="number"
                  value={builderStake}
                  onChange={(e) => setBuilderStake(e.target.value)}
                  min={0}
                  step={1}
                  className="app-input"
                />
              </div>

              <OptionRow
                label="Game Mode"
                options={[
                  { value: 'hole_by_hole', label: 'Hole by Hole' },
                  { value: 'match_play', label: 'Match Play' },
                  { value: 'segment_match', label: 'Segments' },
                ]}
                selected={builderMode}
                onSelect={(value) => setBuilderMode(value as CustomBuilderMode)}
              />

              <OptionRow
                label="Matchup"
                options={[
                  { value: 'all_players', label: 'All Players' },
                  { value: 'pairwise', label: 'Head to Head' },
                ]}
                selected={builderMatchup}
                onSelect={(value) => setBuilderMatchup(value as CustomBuilderMatchup)}
              />

              <OptionRow
                label="Tie Rule"
                options={[
                  { value: 'carry', label: 'Carry' },
                  { value: 'push', label: 'Push' },
                  { value: 'halve', label: 'Halve' },
                  { value: 'split', label: 'Split' },
                ]}
                selected={builderTiePolicy}
                onSelect={(value) => setBuilderTiePolicy(value as CustomBuilderTiePolicy)}
              />

              <OptionRow
                label="Payout"
                options={[
                  { value: 'winner_takes_from_all', label: 'Winner Takes All' },
                  { value: 'flat_match_bet', label: 'Flat Match Bet' },
                ]}
                selected={builderPayout}
                onSelect={(value) => setBuilderPayout(value as CustomBuilderPayout)}
              />

              <div className="space-y-3 rounded-2xl bg-[#f8f3e9] px-3 py-3">
                <label className="flex items-center gap-3 text-sm text-[#314131]">
                  <input
                    type="checkbox"
                    checked={builderTeamPlay}
                    onChange={(e) => {
                      setBuilderTeamPlay(e.target.checked)
                      if (!e.target.checked) setBuilderAllowTeamChanges(false)
                    }}
                    className="h-5 w-5 accent-[#174c38]"
                  />
                  Team mode
                </label>
                {builderTeamPlay && (
                  <label className="flex items-center gap-3 text-sm text-[#314131]">
                    <input
                      type="checkbox"
                      checked={builderAllowTeamChanges}
                      onChange={(e) => setBuilderAllowTeamChanges(e.target.checked)}
                      className="h-5 w-5 accent-[#174c38]"
                    />
                    Teams can change by hole
                  </label>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveSelectedGame(buildManualGame())}
                  disabled={saving}
                  className="primary-button flex-1 disabled:opacity-40"
                >
                  {saving ? 'Starting…' : 'Start With Builder'}
                </button>
                <button
                  type="button"
                  onClick={() => void saveTemplate(buildManualGame(), 'Saved to your game modes.')}
                  disabled={templateSaving}
                  className="secondary-button flex-1 disabled:opacity-40"
                >
                  {templateSaving ? 'Saving…' : 'Save Mode'}
                </button>
              </div>
            </div>

            {aiError && (
              <div className="rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm text-[#a34d2d]">
                {aiError}
              </div>
            )}

            {aiResult && (
              <div className="space-y-3">
                <div className="surface-card-strong px-4 py-4">
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#5a6758]">Game Name</label>
                    <input
                      type="text"
                      value={aiResult.name}
                      onChange={(e) => setAiResult({ ...aiResult, name: e.target.value })}
                      className="app-input px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-[#112218] capitalize">{aiResult.type.replace('_', ' ')}</p>
                    <p className="font-semibold text-[#174c38]">${aiResult.stake}/player</p>
                  </div>
                  {typeof aiResult.rules_json.summary === 'string' && aiResult.rules_json.summary && (
                    <p className="mt-2 text-sm text-[#536153]">{aiResult.rules_json.summary}</p>
                  )}
                  {Object.entries(aiResult.rules_json).length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-[#5a6758]">
                      {Object.entries(aiResult.rules_json)
                        .filter(([k]) => k !== 'summary')
                        .map(([k, v]) => (
                        <li key={k}>{k.replace(/_/g, ' ')}: {formatRuleValue(v)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  onClick={() => void saveSelectedGame(aiResult)}
                  disabled={saving}
                  className="primary-button w-full disabled:opacity-40"
                >
                  {saving ? 'Starting…' : 'Start Round With This Game'}
                </button>
                <div className="surface-card px-4 py-4">
                  <p className="text-sm font-medium text-[#112218]">Save this as a game mode?</p>
                  <p className="mt-1 text-sm text-[#5a6758]">
                    Keep it in the Games tab so you can reuse it next time.
                  </p>
                  <button
                    type="button"
                    onClick={() => void saveAiTemplate()}
                    disabled={templateSaving}
                    className="secondary-button mt-4 w-full disabled:opacity-40"
                  >
                    {templateSaving ? 'Saving…' : 'Save To Game Modes'}
                  </button>
                  {templateMessage && (
                    <p className="mt-3 text-sm text-[#174c38]">{templateMessage}</p>
                  )}
                </div>
              </div>
            )}

            {aiQuestion && (
              <div className="surface-card space-y-3 px-4 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6758]">AI Question</p>
                  <p className="mt-1 text-sm text-[#314131]">{aiQuestion}</p>
                </div>
                <input
                  type="text"
                  value={aiAnswerInput}
                  onChange={(e) => setAiAnswerInput(e.target.value)}
                  placeholder="Your answer"
                  className="app-input"
                />
                <button
                  disabled={!aiAnswerInput.trim() || aiLoading}
                  onClick={() => void submitAiAnswer()}
                  className="primary-button w-full disabled:opacity-40"
                >
                  {aiLoading ? 'Checking…' : 'Answer & Continue'}
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm text-[#a34d2d]">
            {error}
          </div>
        )}

        <div className="mt-2">
          <button
            disabled={saving || quitting}
            onClick={handleSave}
            className="primary-button w-full disabled:opacity-40"
          >
            {saving ? 'Saving…' : selected ? 'Start Round' : 'Skip — Start Round'}
          </button>
          <button
            type="button"
            disabled={saving || quitting}
            onClick={() => void handleQuit()}
            className="mt-3 w-full rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#a34d2d] disabled:opacity-50"
          >
            {quitting ? 'Quitting…' : 'Quit'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}

function OptionRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: Array<{ value: string; label: string }>
  selected: string
  onSelect: (value: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#5a6758]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
              selected === option.value
                ? 'border-[#174c38] bg-[#174c38] text-[#f8f3e9]'
                : 'border-[rgba(17,34,24,0.1)] bg-white text-[#536153]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
