'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeleteRoundButton({ roundId }: { roundId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    const confirmed = window.confirm('Delete this live game? This cannot be undone.')
    if (!confirmed) return

    setError('')
    setDeleting(true)
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('rounds').delete().eq('id', roundId)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }

    router.refresh()
  }

  return (
    <div className="ml-2 flex-shrink-0 text-right">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-full border border-[#e8b2a0] bg-[#fff1ec] px-3 py-1.5 text-xs font-semibold text-[#a34d2d] disabled:opacity-50"
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      {error && <p className="mt-1 text-[11px] text-[#a34d2d]">{error}</p>}
    </div>
  )
}
