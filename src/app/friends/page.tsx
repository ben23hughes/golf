import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AddFriendSearch from './AddFriendSearch'
import FriendRequestCard from './FriendRequestCard'
import AppShell from '@/components/AppShell'
import Avatar from '@/components/Avatar'

type ProfileRef = { id: string; name: string; username: string; avatar_url?: string | null }

function pickProfile(p: ProfileRef | ProfileRef[]): ProfileRef {
  return Array.isArray(p) ? p[0] : p
}

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: friendships }, { data: pending }] = await Promise.all([
    supabase
      .from('friendships')
      .select(`
        id, requester_id, addressee_id,
        requester:profiles!friendships_requester_id_fkey(id, name, username, avatar_url),
        addressee:profiles!friendships_addressee_id_fkey(id, name, username, avatar_url)
      `)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted'),
    supabase
      .from('friendships')
      .select(`id, requester:profiles!friendships_requester_id_fkey(id, name, username, avatar_url)`)
      .eq('addressee_id', user.id)
      .eq('status', 'pending'),
  ])

  const friends: ProfileRef[] = ((friendships ?? []) as unknown as { requester_id: string; addressee_id: string; requester: ProfileRef | ProfileRef[]; addressee: ProfileRef | ProfileRef[] }[]).map((f) =>
    pickProfile(f.requester_id === user.id ? f.addressee : f.requester)
  )

  const pendingList: { id: string; requester: ProfileRef }[] = ((pending ?? []) as unknown as { id: string; requester: ProfileRef | ProfileRef[] }[]).map((p) => ({
    id: p.id,
    requester: pickProfile(p.requester),
  }))

  return (
    <AppShell
      title="Friends"
      eyebrow="Your Group"
      description="Search by username, accept invites, and keep your regular betting crew one tap away."
      backHref="/dashboard"
    >
      <div className="space-y-6">
        <section className="surface-card-strong px-5 py-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="section-label">Add Friends</p>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-[#112218]">Bring the group in.</h2>
            </div>
            <span className="status-chip bg-[#dce8df] text-[#174c38]">{friends.length} connected</span>
          </div>
          <AddFriendSearch currentUserId={user.id} />
        </section>

        {pendingList.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-label px-1">Requests ({pendingList.length})</h2>
            <div className="space-y-3">
              {pendingList.map((p) => (
                <FriendRequestCard key={p.id} friendshipId={p.id} requester={p.requester} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="section-label px-1">{friends.length > 0 ? `Friends (${friends.length})` : 'Friends'}</h2>
          {friends.length === 0 ? (
            <div className="surface-card px-5 py-6 text-center">
              <p className="font-semibold text-[#112218]">No crew yet.</p>
              <p className="mt-2 text-sm leading-6 text-[#5a6758]">
                Search for people above and this screen becomes your standing golf group.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {friends.map((f) => (
                <div key={f.id} className="surface-card flex items-center gap-3 px-4 py-4">
                  <Avatar name={f.name} avatarUrl={f.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#112218]">{f.name}</p>
                    {f.username && <p className="mt-1 text-xs text-[#5a6758]">@{f.username}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
