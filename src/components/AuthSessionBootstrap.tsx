'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SESSION_STORAGE_KEY = 'golfbetting:supabase-session'

const AUTH_PAGES = new Set(['/auth/login', '/auth/signup'])

export default function AuthSessionBootstrap() {
  const router = useRouter()
  const pathname = usePathname()
  const restoringRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    function persistSession(session: unknown) {
      if (typeof window === 'undefined') return

      if (!session) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY)
        return
      }

      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    }

    async function restoreSessionIfNeeded() {
      if (typeof window === 'undefined' || restoringRef.current) return

      const { data } = await supabase.auth.getSession()
      if (data.session) {
        persistSession(data.session)
        return
      }

      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY)
      if (!rawSession) return

      restoringRef.current = true

      try {
        const parsed = JSON.parse(rawSession) as {
          access_token?: string
          refresh_token?: string
        }

        if (!parsed?.access_token || !parsed?.refresh_token) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY)
          return
        }

        const { error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        })

        if (error) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY)
          return
        }

        if (AUTH_PAGES.has(pathname)) {
          router.replace('/')
        } else {
          router.refresh()
        }
      } finally {
        restoringRef.current = false
      }
    }

    void restoreSessionIfNeeded()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      persistSession(session)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [pathname, router])

  return null
}
