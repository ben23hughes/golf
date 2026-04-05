import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFriendRequestPush } from '@/lib/push'

export const runtime = 'nodejs'

type FriendRequestBody = {
  addresseeUserId?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as FriendRequestBody
  const addresseeUserId = body.addresseeUserId?.trim()

  if (!addresseeUserId) {
    return NextResponse.json({ error: 'Invalid friend request payload.' }, { status: 400 })
  }

  const { data: requesterProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const requesterName = requesterProfile?.name?.trim() || 'A golfer'

  await sendFriendRequestPush([addresseeUserId], {
    title: 'New friend request',
    body: `${requesterName} sent you a friend request.`,
    url: '/friends',
    tag: `friend-request:${user.id}`,
  })

  return NextResponse.json({ ok: true })
}
