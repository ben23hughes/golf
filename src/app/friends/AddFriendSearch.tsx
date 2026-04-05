'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

type UserResult = { id: string; name: string; username: string; avatar_url?: string | null }
type RequestStatus = 'idle' | 'sent' | 'already_friends' | 'error'

export default function AddFriendSearch({ currentUserId }: { currentUserId: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserResult[]>([])
  const [searching, setSearching] = useState(false)
  const [sentTo, setSentTo] = useState<Record<string, RequestStatus>>({})

  async function handleSearch(value: string) {
    setQuery(value)
    if (value.trim().length < 2) { setResults([]); return }

    setSearching(true)
    const supabase = createClient()
    const { data } = await supabase.rpc('search_users', {
      query: value.trim(),
      requesting_user_id: currentUserId,
    })
    setResults((data as UserResult[]) ?? [])
    setSearching(false)
  }

  async function sendRequest(targetId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('friendships').insert({
      requester_id: currentUserId,
      addressee_id: targetId,
      status: 'pending',
    })

    if (error) {
      setSentTo((prev) => ({ ...prev, [targetId]: error.code === '23505' ? 'already_friends' : 'error' }))
    } else {
      await fetch('/api/push/friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresseeUserId: targetId }),
      })

      setSentTo((prev) => ({ ...prev, [targetId]: 'sent' }))
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name or username"
          autoCapitalize="none"
          autoCorrect="off"
          className="app-input pr-24"
        />
        {searching && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#5a6758]">Searching…</span>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((u) => {
            const status = sentTo[u.id]
            return (
              <div key={u.id} className="surface-card flex items-center gap-3 px-4 py-4">
                <Avatar name={u.name} avatarUrl={u.avatar_url} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#112218]">{u.name}</p>
                  {u.username && <p className="mt-1 text-xs text-[#5a6758]">@{u.username}</p>}
                </div>
                {status === 'sent' ? (
                  <span className="status-chip bg-[#dce8df] text-[#174c38]">Sent</span>
                ) : status === 'already_friends' ? (
                  <span className="text-xs text-[#5a6758]">Already added</span>
                ) : (
                  <button
                    onClick={() => sendRequest(u.id)}
                    className="primary-button px-4 py-2.5 text-sm"
                  >
                    Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="px-1 text-sm text-[#5a6758]">No users found.</p>
      )}
    </div>
  )
}
