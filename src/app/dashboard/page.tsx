import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DeleteRoundButton from '@/components/DeleteRoundButton'
import AppShell from '@/components/AppShell'
import RoundInviteCard from '@/components/RoundInviteCard'
import Avatar from '@/components/Avatar'

type InviteJoin = { course_name: string }
type InviterJoin = { name: string }

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: myRounds }, { data: friendships }, { data: pendingInvites }] = await Promise.all([
    supabase.from('profiles').select('name, username, avatar_url').eq('id', user.id).single(),
    supabase
      .from('rounds')
      .select('*, players(count)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted'),
    supabase
      .from('round_invites')
      .select(`
        id,
        round_id,
        created_at,
        rounds!inner(course_name),
        inviter:profiles!round_invites_invited_by_fkey(name)
      `)
      .eq('invited_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  // Get friend IDs
  const friendIds = (friendships ?? []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )

  // Get friends' recent rounds
  const { data: friendRounds } = friendIds.length > 0
    ? await supabase
        .from('rounds')
        .select('*, profiles!rounds_created_by_fkey(name, username, avatar_url), players(count)')
        .in('created_by', friendIds)
        .order('created_at', { ascending: false })
        .limit(15)
    : { data: [] }

  const active = myRounds?.filter((r) => r.status === 'active') ?? []
  const past = myRounds?.filter((r) => r.status === 'completed') ?? []
  const firstName = profile?.name?.split(' ')[0] ?? 'Golfer'
  const inviteCount = pendingInvites?.length ?? 0

  return (
    <AppShell
      title={firstName}
      eyebrow="Clubhouse"
      description={
        inviteCount > 0
          ? `${inviteCount} round invite${inviteCount === 1 ? '' : 's'} waiting for you.`
          : profile?.username ? `Signed in as @${profile.username}` : 'Track rounds, bets, and the group.'
      }
    >
      <div className="space-y-6">
        {inviteCount > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="section-label">Invites</h2>
              <span className="text-sm font-medium text-[#536153]">{inviteCount} pending</span>
            </div>
            <div className="space-y-3">
              {pendingInvites?.map((invite) => (
                <RoundInviteCard
                  key={invite.id}
                  inviteId={invite.id}
                  roundId={invite.round_id}
                  courseName={pickOne(invite.rounds as InviteJoin | InviteJoin[] | null)?.course_name ?? 'Round Invite'}
                  inviterName={pickOne(invite.inviter as InviterJoin | InviterJoin[] | null)?.name ?? 'A player'}
                  invitedAt={invite.created_at}
                />
              ))}
            </div>
          </section>
        )}

        <section className="hero-panel px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar name={profile?.name ?? 'Golfer'} avatarUrl={profile?.avatar_url} size="lg" />
              <div>
              <p className="section-label text-[#d6ddcc]">Today&apos;s Board</p>
              <h2 className="mt-2 font-serif text-[2rem] font-semibold leading-none text-[#f8f3e9]">
                Keep the action moving.
              </h2>
              <p className="mt-3 max-w-[18rem] text-sm leading-6 text-[#dbe7dd]">
                Start a round fast, keep live scores visible, and settle up without digging through menus.
              </p>
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-white/15 bg-white/10 px-3 py-3 text-right text-[#f8f3e9]">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#dbe7dd]">Live</p>
              <p className="mt-1 text-3xl font-bold">{active.length}</p>
              <p className="text-xs text-[#dbe7dd]">round{active.length === 1 ? '' : 's'}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-[#f8f3e9]">
            <StatPill label="Friends" value={String(friendIds.length)} />
            <StatPill label="History" value={String(past.length)} />
            <StatPill label="Feed" value={String((friendRounds ?? []).length)} />
          </div>

          <div className="mt-5 flex gap-3">
            <Link
              href="/round/create"
              className="primary-button flex-1 border border-white/10 text-center"
            >
              Start New Round
            </Link>
            <Link
              href="/friends"
              className="secondary-button border-white/15 bg-white/10 px-4 text-[#f8f3e9]"
            >
              Friends
            </Link>
          </div>
        </section>

        {active.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="section-label">In Progress</h2>
              <span className="text-sm font-medium text-[#536153]">{active.length} live</span>
            </div>
            <div className="space-y-3">
              {active.map((round) => (
                <RoundCard key={round.id} round={round} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="section-label">Friends Feed</h2>
            <Link href="/friends" className="text-sm font-semibold text-[#174c38]">
              {friendIds.length === 0 ? 'Add players' : 'Manage'}
            </Link>
          </div>

          {friendIds.length === 0 ? (
            <Link href="/friends" className="surface-card block px-5 py-5 text-center">
              <p className="font-semibold text-[#112218]">Build your group.</p>
              <p className="mt-2 text-sm leading-6 text-[#5a6758]">
                Add friends to watch their rounds and keep betting groups ready to go.
              </p>
              <p className="mt-4 text-sm font-semibold text-[#174c38]">Find friends</p>
            </Link>
          ) : (friendRounds ?? []).length === 0 ? (
            <div className="surface-card px-5 py-5 text-center">
              <p className="font-semibold text-[#112218]">Quiet clubhouse.</p>
              <p className="mt-2 text-sm text-[#5a6758]">Your group hasn&apos;t posted a recent round yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(friendRounds ?? []).map((round) => (
                <FriendRoundCard key={round.id} round={round} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="section-label">Recent Rounds</h2>
              <span className="text-sm font-medium text-[#536153]">{past.length} finished</span>
            </div>
            <div className="space-y-3">
              {past.map((round) => (
                <RoundCard key={round.id} round={round} />
              ))}
            </div>
          </section>
        )}

        {myRounds?.length === 0 && friendIds.length === 0 && (
          <div className="surface-card px-5 py-8 text-center">
            <p className="font-semibold text-[#112218]">No action on the board yet.</p>
            <p className="mt-2 text-sm leading-6 text-[#5a6758]">
              Start your first round, add the crew, and the rest of the app will make more sense immediately.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3 text-center">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe7dd]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  )
}

function RoundCard({ round }: {
  round: { id: string; course_name: string; date: string; status: string; players: { count: number }[] }
}) {
  const playerCount = round.players?.[0]?.count ?? 0
  const date = new Date(round.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="surface-card flex items-center justify-between px-4 py-4">
      <Link
        href={`/round/${round.id}/scorecard`}
        className="min-w-0 flex-1 rounded-xl pr-3"
      >
        <p className="font-semibold text-[#112218] truncate">{round.course_name}</p>
        <p className="mt-1 text-sm text-[#5a6758]">{date} · {playerCount} player{playerCount !== 1 ? 's' : ''}</p>
      </Link>
      <div className="ml-3 flex items-center">
        <span className={`status-chip flex-shrink-0 ${
          round.status === 'active'
            ? 'bg-[#dce8df] text-[#174c38]'
            : 'bg-[#ece5d6] text-[#6f695a]'
        }`}>
          {round.status === 'active' ? 'Live' : 'Done'}
        </span>
        {round.status === 'active' && <DeleteRoundButton roundId={round.id} />}
      </div>
    </div>
  )
}

function FriendRoundCard({ round }: {
  round: {
    id: string
    course_name: string
    date: string
    status: string
    players: { count: number }[]
    profiles: { name: string; username: string; avatar_url?: string | null } | null
  }
}) {
  const playerCount = round.players?.[0]?.count ?? 0
  const date = new Date(round.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
  const friendName = round.profiles?.name ?? 'Friend'

  return (
    <Link
      href={`/round/${round.id}/leaderboard`}
      className="surface-card flex items-center gap-3 px-4 py-4"
    >
      <Avatar name={friendName} avatarUrl={round.profiles?.avatar_url} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#112218] truncate">{round.course_name}</p>
        <p className="mt-1 text-xs text-[#5a6758]">{friendName} · {date} · {playerCount} players</p>
      </div>
      <span className={`status-chip flex-shrink-0 ${
        round.status === 'active'
          ? 'bg-[#dce8df] text-[#174c38]'
          : 'bg-[#ece5d6] text-[#6f695a]'
      }`}>
        {round.status === 'active' ? 'Live' : 'Done'}
      </span>
    </Link>
  )
}
