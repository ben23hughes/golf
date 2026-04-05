'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function WelcomeForm({
  userId,
  initialHandicap,
  initialVenmoHandle,
}: {
  userId: string
  initialHandicap: number | null
  initialVenmoHandle: string | null
}) {
  const router = useRouter()
  const [handicap, setHandicap] = useState(initialHandicap?.toString() ?? '')
  const [venmoHandle, setVenmoHandle] = useState(initialVenmoHandle ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function completeOnboarding(skip = false) {
    setError('')
    setLoading(true)

    const normalizedVenmoHandle = venmoHandle.trim().replace(/^@+/, '')
    const parsedHandicap = handicap.trim() ? Number.parseFloat(handicap) : null

    if (!skip) {
      if (parsedHandicap != null && Number.isNaN(parsedHandicap)) {
        setError('Handicap must be a valid number.')
        setLoading(false)
        return
      }

      if (normalizedVenmoHandle && !/^[a-zA-Z0-9_-]{2,30}$/.test(normalizedVenmoHandle)) {
        setError('Venmo must use 2-30 letters, numbers, dashes, or underscores.')
        setLoading(false)
        return
      }
    }

    const supabase = createClient()
    const updates = skip
      ? { onboarding_completed: true }
      : {
          handicap: parsedHandicap,
          venmo_handle: normalizedVenmoHandle || null,
          onboarding_completed: true,
        }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="app-page flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="hero-panel px-5 py-6">
          <p className="section-label text-[#d6ddcc]">Welcome To Golf Betting</p>
          <h1 className="mt-3 font-serif text-[2.5rem] font-semibold leading-none text-[#f8f3e9]">
            Let&apos;s get started.
          </h1>
          <p className="mt-3 max-w-[18rem] text-sm leading-6 text-[#dbe7dd]">
            Add your Venmo username and handicap to make settlements and round setup easier. You can skip this and do it later in profile.
          </p>
        </div>

        <div className="surface-card-strong mt-4 space-y-5 p-5">
          {error && (
            <div className="rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm text-[#a34d2d]">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Venmo Username</label>
            <input
              type="text"
              value={venmoHandle}
              onChange={(e) => setVenmoHandle(e.target.value.replace(/\s+/g, ''))}
              className="app-input"
              placeholder="@yourhandle"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Handicap</label>
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

          <button
            type="button"
            disabled={loading}
            onClick={() => void completeOnboarding(false)}
            className="primary-button w-full disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => void completeOnboarding(true)}
            className="secondary-button w-full disabled:opacity-50"
          >
            Skip For Now
          </button>
        </div>
      </div>
    </div>
  )
}
