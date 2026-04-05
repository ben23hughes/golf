'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

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

    try {
      const supabase = createClient()
      const normalizedIdentifier = identifier.trim().toLowerCase()
      let email = normalizedIdentifier

      if (!isEmail(normalizedIdentifier)) {
        const { data: resolvedEmail, error: lookupError } = await supabase.rpc('get_login_email', {
          login_identifier: normalizedIdentifier,
        })

        if (lookupError) {
          setError('Unable to sign in right now. Please try again.')
          return
        }

        if (!resolvedEmail) {
          setError('Invalid username/email or password.')
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
    } catch {
      setError('Login failed unexpectedly. Please try again.')
    } finally {
      setLoading(false)
    }
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
