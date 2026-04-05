import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileForm from './ProfileForm'
import AppShell from '@/components/AppShell'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, username, email, handicap, ghin_number')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/dashboard')

  return (
    <AppShell
      title="Profile"
      eyebrow="Account"
      description="Keep your identity, handicap, and GHIN details clean so round setup stays fast."
      backHref="/dashboard"
    >
      <div>
        <ProfileForm
          userId={user.id}
          initialName={profile.name}
          initialUsername={profile.username}
          initialEmail={profile.email}
          initialHandicap={profile.handicap}
          initialGhinNumber={profile.ghin_number}
        />
      </div>
    </AppShell>
  )
}
