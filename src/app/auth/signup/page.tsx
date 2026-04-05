'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [handicap, setHandicap] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  function normalizeUsername(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const normalizedUsername = normalizeUsername(username)
      if (normalizedUsername.length < 3) {
        setError('Username must be at least 3 characters and use only letters, numbers, or underscores.')
        return
      }

      const supabase = createClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            username: normalizedUsername,
            handicap: handicap.trim() ? Number.parseFloat(handicap) : null,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (!data.session) {
        setSuccess('Account created. Check your email to confirm your account, then sign in.')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Signup failed unexpectedly. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div className="app-page flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="hero-panel px-5 py-6">
          <p className="section-label text-[#d6ddcc]">Golf Betting</p>
          <h1 className="mt-3 font-serif text-[2.5rem] font-semibold leading-none text-[#f8f3e9]">
            Create your clubhouse.
          </h1>
          <p className="mt-3 max-w-[18rem] text-sm leading-6 text-[#dbe7dd]">
            Set up your account once, then start rounds and add players without the usual mess.
          </p>
        </div>

        <form onSubmit={handleSignup} className="surface-card-strong mt-4 space-y-5 p-5">
          {success && (
            <div className="rounded-2xl border border-[#bfd1c4] bg-[#edf4ef] px-4 py-3 text-sm text-[#174c38]">
              {success}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm text-[#a34d2d]">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="app-input"
              placeholder="Ben"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              required
              minLength={3}
              autoCapitalize="none"
              autoCorrect="off"
              className="app-input"
              placeholder="ben"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="app-input"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">HCP</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value)}
              className="app-input"
              placeholder="HCP, e.g. 8.4"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="app-input"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="primary-button mt-2 w-full disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[rgba(17,34,24,0.12)]" />
          <span className="text-xs uppercase tracking-[0.18em] text-[#5a6758]">or</span>
          <div className="h-px flex-1 bg-[rgba(17,34,24,0.12)]" />
        </div>

        <button
          onClick={handleGoogleLogin}
          className="secondary-button w-full gap-2.5"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p className="mt-8 text-center text-sm text-[#5a6758]">
          Have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-[#174c38]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
