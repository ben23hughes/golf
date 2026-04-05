'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

type ProfileRef = { id: string; name: string; username: string }

export default function FriendRequestCard({ friendshipId, requester }: { friendshipId: string; requester: ProfileRef }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function accept() {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    router.refresh()
    setLoading(false)
  }

  async function decline() {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('friendships').delete().eq('id', friendshipId)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="surface-card flex items-center gap-3 px-4 py-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ece5d6] text-[#6f695a]">
        <span className="font-bold text-sm">{requester.name[0].toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#112218]">{requester.name}</p>
        {requester.username && <p className="mt-1 text-xs text-[#5a6758]">@{requester.username}</p>}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={decline}
          disabled={loading}
          className="secondary-button px-3 py-2 text-sm"
        >
          Decline
        </button>
        <button
          onClick={accept}
          disabled={loading}
          className="primary-button px-3.5 py-2 text-sm disabled:opacity-50"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
