import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileForm from './ProfileForm'
import AppShell from '@/components/AppShell'
import PushNotificationPrompt from '@/components/PushNotificationPrompt'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, username, email, avatar_url, handicap, ghin_number, venmo_handle')
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
      <div className="space-y-6">
        <PushNotificationPrompt />
        <ProfileForm
          userId={user.id}
          initialName={profile.name}
          initialUsername={profile.username}
          initialEmail={profile.email}
          initialAvatarUrl={profile.avatar_url}
          initialHandicap={profile.handicap}
          initialGhinNumber={profile.ghin_number}
          initialVenmoHandle={profile.venmo_handle}
        />
      </div>
    </AppShell>
  )
}
