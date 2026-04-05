import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are a golf betting game configurator. Convert natural language descriptions of golf betting games into structured JSON.

Return ONLY valid JSON in one of these formats:
{
  "status": "needs_clarification",
  "question": "one concise follow-up question"
}

or

{
  "status": "ready",
  "game": {
    "type": "custom",
    "name_suggestion": "short game name",
    "summary": "one concise sentence explaining the game",
    "stake": <number per player per unit>,
    "rules": {
      "mode": "hole_by_hole|match_play|segment_match",
      "matchup": "all_players|pairwise",
      "scoring": "low_score",
      "tie_policy": "carry|push|halve|split",
      "payout_style": "winner_takes_from_all|flat_match_bet",
      "segments": [
        { "label": "Front 9", "start_hole": 1, "end_hole": 9, "stake_multiplier": 1 }
      ],
      "presses_allowed": true
    }
  }
}

The AI Builder is for actually creating new games, not renaming built-in games.
Use "custom" even if the game resembles a classic format.
Ask a follow-up question if key details are ambiguous.
Keep it minimal — only include keys that matter.
Only use "low_score" scoring.`

export async function POST(request: Request) {
  const { description, turns } = await request.json()
  const followUpTurns = Array.isArray(turns)
    ? turns.filter(
        (turn): turn is { question: string; answer: string } =>
          typeof turn?.question === 'string' && typeof turn?.answer === 'string'
      )
    : []

  if (!description || typeof description !== 'string' || description.length > 500) {
    return NextResponse.json({ error: 'Invalid description' }, { status: 400 })
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: description },
      ...followUpTurns.flatMap((turn) => [
        { role: 'assistant' as const, content: turn.question },
        { role: 'user' as const, content: turn.answer },
      ]),
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const content = completion.choices[0].message.content
  if (!content) {
    return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
  }

  const parsed = JSON.parse(content)
  return NextResponse.json(parsed)
}
