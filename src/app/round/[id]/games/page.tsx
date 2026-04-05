'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'

type PresetGame = {
  type: string
  label: string
  description: string
  stakePlaceholder: string
  extraFields?: { key: string; label: string; type: 'checkbox' }[]
}

const PRESET_GAMES: PresetGame[] = [
  { type: 'skins', label: 'Skins', description: 'Win a hole outright to win the skin. Ties carry over.', stakePlaceholder: '2' },
  { type: 'nassau', label: 'Nassau', description: 'Three bets: front 9, back 9, and overall 18.', stakePlaceholder: '5', extraFields: [{ key: 'presses_allowed', label: 'Automatic presses', type: 'checkbox' }] },
  { type: 'match_play', label: 'Match Play', description: 'Head-to-head match, most holes won takes the pot.', stakePlaceholder: '10' },
  { type: 'wolf', label: 'Wolf', description: 'Each hole a player picks a partner or goes solo.', stakePlaceholder: '2' },
  { type: 'vegas', label: 'Vegas', description: 'Combine two scores per team into one number.', stakePlaceholder: '1' },
  { type: 'sixes', label: 'Sixes', description: 'Partners rotate every 6 holes.', stakePlaceholder: '5' },
  { type: 'quota', label: 'Quota', description: 'Points system based on handicap quota.', stakePlaceholder: '1' },
  { type: 'best_ball', label: 'Best Ball', description: 'Best score per team counts on each hole.', stakePlaceholder: '5' },
  { type: 'left_right', label: 'Left Right', description: 'Win hole, win bets from neighbors.', stakePlaceholder: '2' },
  { type: 'banker', label: 'Banker', description: 'One player takes all bets each hole.', stakePlaceholder: '2' },
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

type SavedTemplate = {
  id: string
  name: string
  games_json: SelectedGame[]
}

export default function GamesPage() {
  const { id: roundId } = useParams<{ id: string }>()
  const router = useRouter()

  const [tab, setTab] = useState<'preset' | 'ai'>('preset')
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [selected, setSelected] = useState<SelectedGame | null>(null)
  const [saving, setSaving] = useState(false)
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

  useEffect(() => {
    const supabase = createClient()

    async function loadTemplates() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('game_templates')
        .select('id, name, games_json')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setSavedTemplates((data as SavedTemplate[] | null) ?? [])
    }

    void loadTemplates()
  }, [])

  function selectGame(preset: PresetGame) {
    if (selected?.type === preset.type) {
      setSelected(null)
    } else {
      setSelected({ name: preset.label, type: preset.type, stake: preset.stakePlaceholder, rules_json: {} })
    }
  }

  function selectSavedTemplate(template: SavedTemplate) {
    const [firstGame] = template.games_json ?? []
    if (!firstGame) return
    setSelected(firstGame)
  }

  function updateName(name: string) {
    if (selected) setSelected({ ...selected, name })
  }

  function updateStake(stake: string) {
    if (selected) setSelected({ ...selected, stake })
  }

function updateRule(key: string, value: unknown) {
  if (selected) setSelected({ ...selected, rules_json: { ...selected.rules_json, [key]: value } })
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
      name: aiResult.name.trim() || 'Custom Game',
      games_json: [aiResult],
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

    setTemplateMessage('Saved to your game modes.')
    setTemplateSaving(false)
  }

  async function handleSave() {
    await saveSelectedGame(selected)
  }

  const selectedPreset = PRESET_GAMES.find((p) => p.type === selected?.type)

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
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectSavedTemplate(template)}
                      className={`surface-card-strong w-full px-4 py-4 text-left transition ${isSelected ? 'ring-2 ring-[#174c38]/25' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#112218]">{template.name}</p>
                          <p className="mt-1 text-xs text-[#5a6758]">
                            {firstGame.type.replace(/_/g, ' ')} · ${firstGame.stake}/player
                          </p>
                        </div>
                        <span className="status-chip bg-[#dce8df] text-[#174c38]">Saved</span>
                      </div>
                    </button>
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
                  <button
                    onClick={() => selectGame(preset)}
                    className="w-full px-4 py-4 flex items-center gap-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#112218]">{preset.label}</p>
                      <p className="mt-1 text-xs text-[#5a6758]">{preset.description}</p>
                    </div>
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
                      isSelected ? 'border-[#174c38] bg-[#174c38]' : 'border-[rgba(17,34,24,0.14)]'
                    }`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </button>

                  {isSelected && selectedPreset && (
                    <div className="space-y-3 border-t border-[rgba(17,34,24,0.08)] px-4 pb-4 pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm text-[#536153]">Game name</label>
                        <input
                          type="text"
                          value={selected.name}
                          onChange={(e) => updateName(e.target.value)}
                          className="app-input w-40 px-3 py-2 text-sm"
                        />
                      </div>
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'ai' && (
          <div className="space-y-4">
            <div className="surface-card-strong px-5 py-5">
              <h2 className="font-serif text-2xl font-semibold text-[#112218]">AI Game Builder</h2>
              <p className="mt-2 text-sm leading-6 text-[#5a6758]">Describe a custom game in plain English.</p>
            </div>

            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="$5 Nassau with automatic presses"
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
            disabled={saving}
            onClick={handleSave}
            className="primary-button w-full disabled:opacity-40"
          >
            {saving ? 'Saving…' : selected ? 'Start Round' : 'Skip — Start Round'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}
