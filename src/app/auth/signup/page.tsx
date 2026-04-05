'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
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

      router.push('/welcome')
      router.refresh()
    } catch {
      setError('Signup failed unexpectedly. Please try again.')
    } finally {
      setLoading(false)
    }
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
            Track golf bets, start rounds, and settle up automatically.
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
