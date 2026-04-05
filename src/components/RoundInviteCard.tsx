'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type RoundInviteCardProps = {
  inviteId: string
  roundId: string
  courseName: string
  inviterName: string
  invitedAt: string
}

export default function RoundInviteCard({
  inviteId,
  roundId,
  courseName,
  inviterName,
  invitedAt,
}: RoundInviteCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function respond(status: 'accepted' | 'declined') {
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('round_invites')
      .update({ status })
      .eq('id', inviteId)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    if (status === 'accepted') {
      router.push(`/round/${roundId}/scorecard`)
      router.refresh()
      return
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <div className="surface-card px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="section-label">Round Invite</p>
          <p className="mt-2 font-semibold text-[#112218]">{courseName}</p>
          <p className="mt-1 text-sm text-[#5a6758]">
            {inviterName} added you to this round.
          </p>
          <p className="mt-1 text-xs text-[#7b8777]">
            {new Date(invitedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <span className="status-chip bg-[#ece5d6] text-[#6f695a]">New</span>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void respond('declined')}
          className="secondary-button px-4 py-3 text-[#425242] disabled:opacity-50"
        >
          Decline
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void respond('accepted')}
          className="primary-button flex-1 disabled:opacity-50"
        >
          {loading ? 'Joining…' : 'Join Round'}
        </button>
      </div>
    </div>
  )
}
