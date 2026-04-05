'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import Avatar from '@/components/Avatar'

type Player = {
  name: string
  handicap: string
  userId: string | null
}

type PlayerSearchResult = {
  id: string
  name: string
  username: string
  handicap: number | null
  avatar_url: string | null
}

type NearbyCourseResult = {
  id: number
  display_name: string
  club_name: string
  course_name: string
  location_label: string
  state_code: string
  tee_names: string[]
  distance_meters: number
}

export default function CreateRoundPage() {
  const router = useRouter()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([
    { name: '', handicap: '', userId: null },
    { name: '', handicap: '', userId: null },
  ])
  const [resultsByIndex, setResultsByIndex] = useState<Record<number, PlayerSearchResult[]>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [course, setCourse] = useState<NearbyCourseResult | null>(null)
  const [courseQuery, setCourseQuery] = useState('')
  const [courseResults, setCourseResults] = useState<NearbyCourseResult[]>([])
  const [courseError, setCourseError] = useState('')
  const [locatingCourse, setLocatingCourse] = useState(false)
  const [searchingCourses, setSearchingCourses] = useState(false)

  function getLocalDateValue() {
    return new Intl.DateTimeFormat('en-CA').format(new Date())
  }

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)

      if (!user) {
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, handicap')
        .eq('id', user.id)
        .maybeSingle()

      setPlayers((currentPlayers) => {
        const firstPlayer = currentPlayers[0]
        if (!firstPlayer || firstPlayer.name.trim()) {
          return currentPlayers
        }

        const nextPlayers = [...currentPlayers]
        nextPlayers[0] = {
          name: profile?.name?.trim() || user.email?.split('@')[0] || '',
          handicap: profile?.handicap != null ? String(profile.handicap) : '',
          userId: user.id,
        }
        return nextPlayers
      })
    })
  }, [])

  async function detectCourse() {
    if (!navigator.geolocation) {
      setCourseError('Location is not supported on this device.')
      return
    }

    setLocatingCourse(true)
    setCourseError('')

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      })
    }).catch((geoError: GeolocationPositionError) => {
      setCourseError(
        geoError.code === geoError.PERMISSION_DENIED
          ? 'Location permission was denied. You can still add players and set the course later.'
          : 'Unable to get your location right now.'
      )
      return null
    })

    if (!position) {
      setLocatingCourse(false)
      return
    }

    try {
      const response = await fetch(
        `/api/course-nearby?lat=${position.coords.latitude}&lng=${position.coords.longitude}`
      )
      const data = (await response.json()) as {
        error?: string
        course?: NearbyCourseResult
      }

      if (!response.ok || !data.course) {
        setCourseError(data.error ?? 'Unable to match your location to a course.')
        setCourse(null)
        setCourseResults([])
        setLocatingCourse(false)
        return
      }

      setCourse(data.course)
      setCourseQuery(data.course.course_name)
      setCourseResults((data as { alternatives?: NearbyCourseResult[] }).alternatives ?? [])
    } catch {
      setCourseError('Unable to match your location to a course.')
      setCourse(null)
      setCourseResults([])
    }

    setLocatingCourse(false)
  }

  useEffect(() => {
    queueMicrotask(() => {
      void detectCourse()
    })
  }, [])

  async function searchCourses() {
    const trimmedQuery = courseQuery.trim()
    if (trimmedQuery.length < 2) {
      setCourseError('Type at least 2 characters to search for a course.')
      setCourseResults([])
      return
    }

    setSearchingCourses(true)
    setCourseError('')

    try {
      const stateQuery = course?.state_code ? `&state=${encodeURIComponent(course.state_code)}` : ''
      const response = await fetch(`/api/course-search?query=${encodeURIComponent(trimmedQuery)}${stateQuery}`)
      const data = (await response.json()) as {
        error?: string
        courses?: Array<{
          id: number
          display_name: string
          club_name: string
          course_name: string
          location_label: string
          state_code: string
          tee_names: string[]
        }>
      }

      if (!response.ok) {
        setCourseError(data.error ?? 'Unable to search courses right now.')
        setCourseResults([])
        setSearchingCourses(false)
        return
      }

      const nextResults = (data.courses ?? []).map((result) => ({
        ...result,
        distance_meters: 0,
      }))

      setCourseResults(nextResults)
      if (nextResults.length > 0) {
        setCourse(nextResults[0])
      } else {
        setCourse(null)
        setCourseError('No courses matched that search.')
      }
    } catch {
      setCourseError('Unable to search courses right now.')
      setCourseResults([])
    }

    setSearchingCourses(false)
  }

  function selectCourse(nextCourse: NearbyCourseResult) {
    setCourse(nextCourse)
    setCourseQuery(nextCourse.course_name)
    setCourseError('')
  }

  function addPlayer() {
    setPlayers([...players, { name: '', handicap: '', userId: null }])
  }

  function removePlayer(i: number) {
    setPlayers(players.filter((_, idx) => idx !== i))
    setResultsByIndex((prev) => {
      const updated = { ...prev }
      delete updated[i]
      return updated
    })
  }

  function updatePlayer(i: number, field: keyof Player, value: string) {
    const updated = [...players]
    updated[i] = { ...updated[i], [field]: value }

    if (field === 'name') {
      updated[i] = { ...updated[i], name: value, userId: null }
    }

    setPlayers(updated)
  }

  function ignoreSuggestions(i: number) {
    setResultsByIndex((prev) => ({ ...prev, [i]: [] }))
  }

  async function searchPlayers(i: number, value: string) {
    updatePlayer(i, 'name', value)

    if (value.trim().length < 2) {
      setResultsByIndex((prev) => ({ ...prev, [i]: [] }))
      return
    }

    const supabase = createClient()
    const { data } = await supabase.rpc('search_round_players', {
      query: value.trim(),
      current_user_id: currentUserId,
    })

    setResultsByIndex((prev) => ({
      ...prev,
      [i]: ((data as PlayerSearchResult[] | null) ?? []).slice(0, 6),
    }))
  }

  function selectPlayer(i: number, player: PlayerSearchResult) {
    const updated = [...players]
    updated[i] = {
      name: player.name,
      handicap: player.handicap != null ? String(player.handicap) : '',
      userId: player.id,
    }
    setPlayers(updated)
    setResultsByIndex((prev) => ({ ...prev, [i]: [] }))
  }

  async function handleCreate() {
    setError('')
    const namedPlayers = players.filter((p) => p.name.trim())
    if (namedPlayers.length < 2) {
      setError('Add at least 2 players.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const date = getLocalDateValue()
    const teeBox = course?.tee_names.find((name) => name.toLowerCase() === 'white') ?? course?.tee_names[0] ?? 'White'
    const manualCourseName = courseQuery.trim()

    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        course_name: course?.course_name || manualCourseName || today,
        date,
        tee_box: teeBox,
        created_by: user.id,
      })
      .select()
      .single()

    if (roundError || !round) {
      setError(roundError?.message ?? 'Failed to create round')
      setSaving(false)
      return
    }

    const playerRows = namedPlayers.map((p) => ({
      round_id: round.id,
      user_id: p.userId,
      name: p.name.trim(),
      handicap: p.handicap ? parseFloat(p.handicap) : null,
    }))

    const { data: insertedPlayers, error: playersError } = await supabase
      .from('players')
      .insert(playerRows)
      .select('id, user_id')

    if (playersError || !insertedPlayers) {
      setError(playersError.message)
      setSaving(false)
      return
    }

    const inviteRows = insertedPlayers
      .filter((player) => player.user_id && player.user_id !== user.id)
      .map((player) => ({
        round_id: round.id,
        player_id: player.id,
        invited_user_id: player.user_id,
        invited_by: user.id,
      }))

    if (inviteRows.length > 0) {
      const { error: inviteError } = await supabase.from('round_invites').insert(inviteRows)
      if (inviteError) {
        setError(inviteError.message)
        setSaving(false)
        return
      }
    }

    router.push(`/round/${round.id}/games`)
  }

  return (
    <AppShell
      title="Who&apos;s In?"
      eyebrow="Round Setup"
      description="Build the card fast. Search your friends or type in guests manually."
      backHref="/dashboard"
    >
      <div className="space-y-6">
        <section className="hero-panel px-5 py-5">
          <p className="section-label text-[#d6ddcc]">Lineup</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-[2rem] font-semibold leading-none text-[#f8f3e9]">
                Add the group.
              </h2>
              <p className="mt-3 max-w-[16rem] text-sm leading-6 text-[#dbe7dd]">
                Friends auto-fill handicap. Everyone else can be added in place.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/10 px-4 py-3 text-center text-[#f8f3e9]">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe7dd]">Named</p>
              <p className="mt-1 text-3xl font-bold">{players.filter((p) => p.name.trim()).length}</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-[#e8b2a0] bg-[#fff1ec] px-4 py-3 text-sm text-[#a34d2d]">
            {error}
          </div>
        )}

        <section className="surface-card-strong px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-label">Course</p>
              <h3 className="mt-2 text-lg font-semibold text-[#112218]">
                {locatingCourse
                  ? 'Checking your location…'
                  : course?.display_name ?? 'Course not detected yet'}
              </h3>
              <p className="mt-1 text-sm text-[#5a6758]">
                {course
                  ? `${course.location_label || 'Nearby course'}${course.distance_meters ? ` · ${course.distance_meters}m away` : ''}`
                  : courseError || 'We’ll try to detect the course from your location before the round starts.'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void detectCourse()}
                className="rounded-full border border-[#174c38] px-3 py-2 text-xs font-semibold text-[#174c38] disabled:opacity-50"
                disabled={locatingCourse}
              >
                {locatingCourse ? 'Locating…' : course ? 'Refresh' : 'Use Location'}
              </button>
              <button
                type="button"
                onClick={() => void searchCourses()}
                className="rounded-full border border-[#314131] px-3 py-2 text-xs font-semibold text-[#314131] disabled:opacity-50"
                disabled={searchingCourses}
              >
                {searchingCourses ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>
          <div className="mt-4">
            <input
              type="text"
              value={courseQuery}
              onChange={(e) => setCourseQuery(e.target.value)}
              placeholder="Type a course name"
              className="app-input"
            />
            <p className="mt-2 text-xs text-[#5a6758]">
              If location misses, type the course name or use search.
            </p>
            {course?.state_code && (
              <p className="mt-1 text-xs text-[#5a6758]">
                Search is currently narrowed to {course.state_code}.
              </p>
            )}
          </div>
          {courseResults.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-[rgba(17,34,24,0.08)] bg-[#fffdf8] shadow-[0_12px_24px_rgba(19,38,28,0.08)]">
              {courseResults.map((result) => (
                <button
                  key={`${result.id}-${result.display_name}`}
                  type="button"
                  onClick={() => selectCourse(result)}
                  className="flex w-full items-center justify-between gap-3 border-b border-[rgba(17,34,24,0.06)] px-4 py-3 text-left last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#112218]">{result.display_name}</p>
                    <p className="truncate text-xs text-[#5a6758]">
                      {result.location_label || 'Location unavailable'}
                      {result.distance_meters > 0 ? ` · ${result.distance_meters}m away` : ''}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#174c38]">Use</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-3">
          {players.map((player, i) => (
            <div key={i} className="surface-card-strong relative p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="section-label">Player {i + 1}</p>
                {players.length > 2 && (
                  <button
                    onClick={() => removePlayer(i)}
                    className="rounded-full border border-[#e8b2a0] bg-[#fff1ec] px-3 py-1.5 text-xs font-semibold text-[#a34d2d]"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={player.name}
                    onChange={(e) => void searchPlayers(i, e.target.value)}
                    placeholder={`Player ${i + 1}`}
                    autoComplete="off"
                    className="app-input"
                  />
                  {resultsByIndex[i]?.length ? (
                    <div className="mt-2 overflow-hidden rounded-2xl border border-[rgba(17,34,24,0.08)] bg-[#fffdf8] shadow-[0_12px_24px_rgba(19,38,28,0.08)]">
                      <div className="flex items-center justify-between border-b border-[rgba(17,34,24,0.06)] px-4 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8c80]">
                          Suggested users
                        </p>
                        <button
                          type="button"
                          onClick={() => ignoreSuggestions(i)}
                          className="text-xs font-semibold text-[#174c38]"
                        >
                          Ignore
                        </button>
                      </div>
                      {resultsByIndex[i].map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => selectPlayer(i, result)}
                          className="flex w-full items-center justify-between gap-3 border-b border-[rgba(17,34,24,0.06)] px-4 py-3 text-left last:border-b-0"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar
                              name={result.name}
                              avatarUrl={result.avatar_url}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[#112218]">{result.name}</p>
                              <p className="truncate text-xs text-[#5a6758]">
                                @{result.username}
                                {result.handicap != null ? ` · HCP ${result.handicap}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8c80]">
                            Pick
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input
                  type="number"
                  value={player.handicap}
                  onChange={(e) => updatePlayer(i, 'handicap', e.target.value)}
                  placeholder="HCP"
                  min={0}
                  max={54}
                  step="0.1"
                  className="app-input w-24 text-center"
                />
              </div>
            </div>
          ))}
        </div>

        <button onClick={addPlayer} className="secondary-button w-full border-dashed">
          + Add Player
        </button>

        <button
          disabled={saving}
          onClick={handleCreate}
          className="primary-button w-full disabled:opacity-40"
        >
          {saving ? 'Starting…' : 'Next: Choose Games'}
        </button>
      </div>
    </AppShell>
  )
}
