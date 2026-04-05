import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DeleteRoundButton from '@/components/DeleteRoundButton'
import AppShell from '@/components/AppShell'
import RoundInviteCard from '@/components/RoundInviteCard'
import Avatar from '@/components/Avatar'
import { calculateLeaderboard } from '@/lib/calculations'
import type { Game, Player, Score } from '@/types'

type InviteJoin = { course_name: string }
type InviterJoin = { name: string }
type FriendProfile = { id: string; name: string; username: string; avatar_url?: string | null }
type FriendRoundEntry = { id: string; name: string; avatar_url?: string | null; total: number }

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function formatTotal(amount: number) {
  const abs = Math.abs(amount).toFixed(2).replace(/\.00$/, '')
  return amount >= 0 ? `+$${abs}` : `-$${abs}`
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

  const [{ data: createdFriendRounds }, { data: friendParticipantRows }, { data: friendProfiles }] = friendIds.length > 0
    ? await Promise.all([
        supabase
          .from('rounds')
          .select('*, profiles!rounds_created_by_fkey(name, username, avatar_url), players(count)')
          .in('created_by', friendIds)
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('players')
          .select('round_id, user_id')
          .in('user_id', friendIds),
        supabase
          .from('profiles')
          .select('id, name, username, avatar_url')
          .in('id', friendIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const participantRoundIds = Array.from(
    new Set(
      (friendParticipantRows ?? [])
        .map((row) => row.round_id)
        .filter((roundId): roundId is string => Boolean(roundId))
    )
  )

  const { data: participatedFriendRounds } = participantRoundIds.length > 0
    ? await supabase
        .from('rounds')
        .select('*, profiles!rounds_created_by_fkey(name, username, avatar_url), players(count)')
        .in('id', participantRoundIds)
        .order('created_at', { ascending: false })
        .limit(15)
    : { data: [] }

  const friendProfileById = new Map(
    ((friendProfiles ?? []) as FriendProfile[]).map((profile) => [profile.id, profile])
  )

  const friendParticipantIdsByRound = new Map<string, string[]>()
  for (const row of friendParticipantRows ?? []) {
    if (!row.round_id || !row.user_id) continue
    const current = friendParticipantIdsByRound.get(row.round_id) ?? []
    if (!current.includes(row.user_id)) {
      friendParticipantIdsByRound.set(row.round_id, [...current, row.user_id])
    }
  }

  const friendRounds = Array.from(
    new Map(
      [...(createdFriendRounds ?? []), ...(participatedFriendRounds ?? [])].map((round) => [round.id, round])
    ).values()
  )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 15)

  const friendRoundIds = (friendRounds ?? []).map((round) => round.id)
  const [{ data: friendRoundPlayers }, { data: friendRoundScores }, { data: friendRoundGames }, { data: friendRoundModifiers }] =
    friendRoundIds.length > 0
      ? await Promise.all([
          supabase.from('players').select('*').in('round_id', friendRoundIds),
          supabase.from('scores').select('*').in('round_id', friendRoundIds),
          supabase.from('games').select('*').in('round_id', friendRoundIds),
          supabase.from('hole_modifiers').select('round_id, hole_number, multiplier').in('round_id', friendRoundIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const friendEntriesByRoundId = new Map<string, FriendRoundEntry[]>()

  for (const round of friendRounds) {
    const players = ((friendRoundPlayers ?? []).filter((player) => player.round_id === round.id) as Player[])
    const scores = ((friendRoundScores ?? []).filter((score) => score.round_id === round.id) as Score[])
    const games = ((friendRoundGames ?? []).filter((game) => game.round_id === round.id) as Game[])
    const holeMultipliers: Record<number, number> = {}
    const participantFriendIds = friendParticipantIdsByRound.get(round.id) ?? []

    for (const modifier of (friendRoundModifiers ?? []).filter((entry) => entry.round_id === round.id)) {
      holeMultipliers[modifier.hole_number] = Number(modifier.multiplier)
    }

    if (players.length === 0 || games.length === 0) {
      const fallbackEntries = participantFriendIds
        .map((friendId) => friendProfileById.get(friendId))
        .filter((profile): profile is FriendProfile => Boolean(profile))
        .map((profile) => ({
          id: profile.id,
          name: profile.name,
          avatar_url: profile.avatar_url,
          total: 0,
        }))
      friendEntriesByRoundId.set(round.id, fallbackEntries)
      continue
    }

    const leaderboard = calculateLeaderboard(players, scores, games, holeMultipliers)
    const friendEntries = participantFriendIds
      .map((friendId) => {
        const profile = friendProfileById.get(friendId)
        if (!profile) return null

        const leaderboardEntry = leaderboard.find((entry) => entry.player.user_id === friendId)
        return {
          id: profile.id,
          name: profile.name,
          avatar_url: profile.avatar_url,
          total: leaderboardEntry?.total ?? 0,
        }
      })
      .filter((entry): entry is FriendRoundEntry => Boolean(entry))

    friendEntriesByRoundId.set(
      round.id,
      friendEntries.sort((a, b) => b.total - a.total)
    )
  }

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
          ) : friendRounds.length === 0 ? (
            <div className="surface-card px-5 py-5 text-center">
              <p className="font-semibold text-[#112218]">Quiet clubhouse.</p>
              <p className="mt-2 text-sm text-[#5a6758]">Your group hasn&apos;t posted a recent round yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {friendRounds.map((round) => (
                <FriendRoundCard
                  key={round.id}
                  round={round}
                  friendEntries={friendEntriesByRoundId.get(round.id) ?? []}
                />
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

function FriendRoundCard({ round, friendEntries }: {
  round: {
    id: string
    course_name: string
    date: string
    status: string
    players: { count: number }[]
    profiles: { name: string; username: string; avatar_url?: string | null } | null
  }
  friendEntries: FriendRoundEntry[]
}) {
  const playerCount = round.players?.[0]?.count ?? 0
  const date = new Date(round.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
  const creatorName = round.profiles?.name ?? 'Friend'
  const leadAvatar = friendEntries[0]?.avatar_url ?? round.profiles?.avatar_url
  const leadName = friendEntries[0]?.name ?? creatorName

  return (
    <Link
      href={`/round/${round.id}/summary?from=dashboard`}
      className="surface-card flex items-start gap-3 px-4 py-4"
    >
      <Avatar name={leadName} avatarUrl={leadAvatar} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#112218] truncate">{round.course_name}</p>
        <p className="mt-1 text-xs text-[#5a6758]">{date} · {playerCount} players</p>
        <p className="mt-2 text-xs font-medium text-[#7b8777]">Created by {creatorName}</p>
        <div className="mt-2 space-y-1.5">
          {friendEntries.length > 0 ? friendEntries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-[#314131]">{entry.name}</span>
              <span className={`font-semibold ${entry.total >= 0 ? 'text-[#174c38]' : 'text-[#a34d2d]'}`}>
                {formatTotal(entry.total)}
              </span>
            </div>
          )) : (
            <p className="text-xs text-[#7b8777]">No friend totals yet.</p>
          )}
        </div>
      </div>
      <div className="text-right">
        <span className={`status-chip mt-1 inline-flex flex-shrink-0 ${
          round.status === 'active'
            ? 'bg-[#dce8df] text-[#174c38]'
            : 'bg-[#ece5d6] text-[#6f695a]'
        }`}>
          {round.status === 'active' ? 'Live' : 'Done'}
        </span>
      </div>
    </Link>
  )
}
