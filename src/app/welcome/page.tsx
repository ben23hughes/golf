import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WelcomeForm from './WelcomeForm'

export default async function WelcomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, avatar_url, handicap, venmo_handle, onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    redirect('/dashboard')
  }

  return (
    <WelcomeForm
      userId={user.id}
      displayName={profile?.name ?? 'Golfer'}
      initialAvatarUrl={profile?.avatar_url ?? null}
      initialHandicap={profile?.handicap ?? null}
      initialVenmoHandle={profile?.venmo_handle ?? null}
    />
  )
}
