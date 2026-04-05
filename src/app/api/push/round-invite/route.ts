import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendRoundInvitePush } from '@/lib/push'

export const runtime = 'nodejs'

type RoundInviteBody = {
  invitedUserIds?: string[]
  courseName?: string
  roundId?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as RoundInviteBody
  const invitedUserIds = Array.from(new Set((body.invitedUserIds ?? []).filter(Boolean)))
  const courseName = body.courseName?.trim() ?? 'New round'
  const roundId = body.roundId?.trim()

  if (invitedUserIds.length === 0 || !roundId) {
    return NextResponse.json({ error: 'Invalid invite payload.' }, { status: 400 })
  }

  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const inviterName = inviterProfile?.name?.trim() || 'A player'

  await sendRoundInvitePush(invitedUserIds, {
    title: 'New round invite',
    body: `${inviterName} added you to ${courseName}.`,
    url: '/dashboard',
    tag: `round-invite:${roundId}`,
  })

  return NextResponse.json({ ok: true })
}
