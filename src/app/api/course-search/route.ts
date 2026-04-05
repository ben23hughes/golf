import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type GolfCourseApiCourse = {
  id: number
  club_name: string
  course_name: string
  location?: {
    address?: string
    city?: string
    state?: string
    country?: string
  }
  tees?: {
    male?: Array<{ tee_name?: string }>
    female?: Array<{ tee_name?: string }>
  }
}

function normalizeState(value: string) {
  return value.trim().toLowerCase()
}

function uniqueTeeNames(course: GolfCourseApiCourse) {
  return Array.from(
    new Set(
      [...(course.tees?.male ?? []), ...(course.tees?.female ?? [])]
        .map((tee) => tee.tee_name?.trim())
        .filter((teeName): teeName is string => Boolean(teeName))
    )
  )
}

function buildDisplayName(course: GolfCourseApiCourse) {
  return course.club_name === course.course_name
    ? course.club_name
    : `${course.club_name} · ${course.course_name}`
}

export async function GET(request: Request) {
  const apiKey = process.env.GOLFCOURSEAPI_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing GOLFCOURSEAPI_KEY on the server.' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')?.trim() ?? ''
  const state = searchParams.get('state')?.trim() ?? ''

  if (query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters.' }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Key ${apiKey}`,
        },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.error('GolfCourseAPI search failed', response.status, text)
      return NextResponse.json(
        { error: response.status === 401 ? 'GolfCourseAPI key was rejected.' : 'Golf course lookup failed.' },
        { status: response.status }
      )
    }

    const data = (await response.json()) as { courses?: GolfCourseApiCourse[] }
    const allCourses = data.courses ?? []
    const stateFilteredCourses = state
      ? allCourses.filter((course) => normalizeState(course.location?.state ?? '') === normalizeState(state))
      : allCourses
    const courses = (stateFilteredCourses.length > 0 ? stateFilteredCourses : allCourses).slice(0, 8).map((course) => ({
      id: course.id,
      display_name: buildDisplayName(course),
      club_name: course.club_name,
      course_name: course.course_name,
      location_label: [course.location?.city, course.location?.state].filter(Boolean).join(', '),
      state_code: course.location?.state ?? '',
      tee_names: uniqueTeeNames(course),
    }))

    return NextResponse.json({ courses })
  } catch (error) {
    console.error('GolfCourseAPI search route failed unexpectedly', error)
    return NextResponse.json({ error: 'Unable to reach GolfCourseAPI right now.' }, { status: 500 })
  }
}
