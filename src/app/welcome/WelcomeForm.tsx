'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

export default function WelcomeForm({
  userId,
  displayName,
  initialAvatarUrl,
  initialHandicap,
  initialVenmoHandle,
}: {
  userId: string
  displayName: string
  initialAvatarUrl: string | null
  initialHandicap: number | null
  initialVenmoHandle: string | null
}) {
  const router = useRouter()
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [handicap, setHandicap] = useState(initialHandicap?.toString() ?? '')
  const [venmoHandle, setVenmoHandle] = useState(initialVenmoHandle ?? '')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setUploading(true)
    const supabase = createClient()
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${userId}/avatar.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`)
    setUploading(false)
  }

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
          avatar_url: avatarUrl,
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

          <div className="flex items-center gap-4">
            <Avatar name={displayName} avatarUrl={avatarUrl} size="lg" />
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-[#314131]">Profile Picture</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleAvatarChange(e)}
                className="block w-full text-sm text-[#536153]"
              />
              <p className="mt-2 text-xs text-[#5a6758]">
                {uploading ? 'Uploading…' : 'Upload now or skip and add one later in profile.'}
              </p>
            </div>
          </div>

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
