'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function isEmail(value: string) {
    return /\S+@\S+\.\S+/.test(value)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const normalizedIdentifier = identifier.trim().toLowerCase()
    let email = normalizedIdentifier

    if (!isEmail(normalizedIdentifier)) {
      const { data: resolvedEmail, error: lookupError } = await supabase.rpc('get_login_email', {
        login_identifier: normalizedIdentifier,
      })

      if (lookupError) {
        setError('Unable to sign in right now. Please try again.')
        setLoading(false)
        return
      }

      if (!resolvedEmail) {
        setError('Invalid username/email or password.')
        setLoading(false)
        return
      }

      email = resolvedEmail
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
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
          <p className="section-label text-[#d6ddcc]">Welcome Back</p>
          <h1 className="mt-3 font-serif text-[2.5rem] font-semibold leading-none text-[#f8f3e9]">
            Pick up the match.
          </h1>
          <p className="mt-3 max-w-[18rem] text-sm leading-6 text-[#dbe7dd]">
            Jump straight back into live score entry, your group feed, and unfinished rounds.
          </p>
        </div>

        <form onSubmit={handleLogin} className="surface-card-strong mt-4 space-y-5 p-5">
          {error && (
            <div className="rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm text-[#a34d2d]">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Username or Email</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              className="app-input"
              placeholder="ben or you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#314131]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="app-input"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="primary-button mt-2 w-full disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
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
          No account?{' '}
          <Link href="/auth/signup" className="font-semibold text-[#174c38]">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
