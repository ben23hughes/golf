import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type SignupBody = {
  name?: string
  username?: string
  email?: string
  password?: string
  handicap?: number | string | null
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignupBody
    const name = body.name?.trim() ?? ''
    const username = normalizeUsername(body.username ?? '')
    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''
    const handicapValue = body.handicap
    const handicap =
      handicapValue === '' || handicapValue == null
        ? null
        : Number.parseFloat(String(handicapValue))

    if (!name) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters and use only letters, numbers, or underscores.' },
        { status: 400 }
      )
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    if (handicap != null && Number.isNaN(handicap)) {
      return NextResponse.json({ error: 'Handicap must be a valid number.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: existingProfile, error: lookupError } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (lookupError) {
      console.error('Signup username lookup failed', lookupError)
      return NextResponse.json({ error: 'Unable to create account right now.' }, { status: 500 })
    }

    if (existingProfile) {
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 })
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        username,
        handicap,
      },
    })

    if (error) {
      console.error('Supabase admin.createUser failed', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (handicap != null && data.user) {
      const { error: profileError } = await admin
        .from('profiles')
        .update({ handicap })
        .eq('id', data.user.id)

      if (profileError) {
        console.error('Profile handicap update failed after signup', profileError)
        return NextResponse.json({ error: 'Account created, but handicap could not be saved.' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Signup route failed unexpectedly', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error during signup.',
      },
      { status: 500 }
    )
  }
}
