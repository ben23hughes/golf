'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import LogoutButton from '@/components/LogoutButton'

type ProfileFormProps = {
  userId: string
  initialName: string
  initialUsername: string
  initialEmail: string
  initialHandicap: number | null
  initialGhinNumber: string | null
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export default function ProfileForm({
  userId,
  initialName,
  initialUsername,
  initialEmail,
  initialHandicap,
  initialGhinNumber,
}: ProfileFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [username, setUsername] = useState(initialUsername)
  const [handicap, setHandicap] = useState(initialHandicap?.toString() ?? '')
  const [ghinNumber, setGhinNumber] = useState(initialGhinNumber ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaved(false)

    const normalizedUsername = normalizeUsername(username)
    if (!name.trim()) {
      setError('Name is required.')
      return
    }

    if (normalizedUsername.length < 3) {
      setError('Username must be at least 3 characters and use only letters, numbers, or underscores.')
      return
    }

    const parsedHandicap = handicap.trim() ? Number.parseFloat(handicap) : null
    if (parsedHandicap != null && Number.isNaN(parsedHandicap)) {
      setError('Handicap must be a valid number.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        username: normalizedUsername,
        handicap: parsedHandicap,
        ghin_number: ghinNumber.trim() || null,
      })
      .eq('id', userId)

    if (updateError) {
      setError(
        updateError.message.includes('profiles_username_lower_idx')
          ? 'That username is already taken.'
          : updateError.message
      )
      setLoading(false)
      return
    }

    setUsername(normalizedUsername)
    setSaved(true)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="surface-card-strong space-y-4 p-5">
        {error && (
          <div className="rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm text-[#a34d2d]">
            {error}
          </div>
        )}

        {saved && (
          <div className="rounded-2xl border border-[#bfd1c4] bg-[#edf4ef] px-4 py-3 text-sm text-[#174c38]">
            Profile updated.
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-[#314131]">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="app-input"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#314131]">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(normalizeUsername(e.target.value))}
            required
            minLength={3}
            className="app-input"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#314131]">Email</label>
          <input
            type="email"
            value={initialEmail}
            disabled
            className="app-input text-[#617061] opacity-80"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#314131]">HCP</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={handicap}
            onChange={(e) => setHandicap(e.target.value)}
            className="app-input"
            placeholder="8.4"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#314131]">GHIN Number</label>
          <input
            type="text"
            value={ghinNumber}
            onChange={(e) => setGhinNumber(e.target.value)}
            className="app-input"
            placeholder="Optional"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="primary-button w-full disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save Profile'}
        </button>
      </form>

      <div className="surface-card p-5">
        <p className="text-sm font-medium text-[#112218]">Account</p>
        <p className="mt-1 text-sm text-[#5a6758]">Sign out from this device.</p>
        <div className="mt-4">
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
