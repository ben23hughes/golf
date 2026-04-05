import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type GolfCourseApiCourse = {
  id: number
  club_name: string
  course_name: string
  location?: {
    city?: string
    state?: string
    latitude?: number
    longitude?: number
  }
  tees?: {
    male?: Array<{ tee_name?: string }>
    female?: Array<{ tee_name?: string }>
  }
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: {
    name?: string
    leisure?: string
    sport?: string
  }
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

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function searchGolfCourseApiByName(apiKey: string, searchQuery: string) {
  const response = await fetch(
    `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(searchQuery)}`,
    {
      headers: {
        Authorization: `Key ${apiKey}`,
      },
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GolfCourseAPI search failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as { courses?: GolfCourseApiCourse[] }
  return data.courses ?? []
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
  const lat = Number.parseFloat(searchParams.get('lat') ?? '')
  const lng = Number.parseFloat(searchParams.get('lng') ?? '')

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Latitude and longitude are required.' }, { status: 400 })
  }

  const overpassQuery = `
[out:json][timeout:15];
(
  nwr(around:4000,${lat},${lng})["leisure"="golf_course"]["name"];
  nwr(around:4000,${lat},${lng})["sport"="golf"]["name"];
);
out center;
`

  try {
    const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      body: overpassQuery,
      cache: 'no-store',
    })

    if (!overpassResponse.ok) {
      const text = await overpassResponse.text()
      console.error('Overpass course lookup failed', overpassResponse.status, text)
      return NextResponse.json({ error: 'Unable to find nearby courses right now.' }, { status: 502 })
    }

    const overpassData = (await overpassResponse.json()) as { elements?: OverpassElement[] }
    const candidates = (overpassData.elements ?? [])
      .map((element) => {
        const point = element.center ?? (
          element.lat != null && element.lon != null
            ? { lat: element.lat, lon: element.lon }
            : null
        )

        if (!point || !element.tags?.name) {
          return null
        }

        return {
          name: element.tags.name,
          distance_meters: distanceMeters(lat, lng, point.lat, point.lon),
        }
      })
      .filter((candidate): candidate is { name: string; distance_meters: number } => Boolean(candidate))
      .sort((a, b) => a.distance_meters - b.distance_meters)
      .filter((candidate, index, list) =>
        list.findIndex((entry) => normalizeName(entry.name) === normalizeName(candidate.name)) === index
      )
      .slice(0, 4)

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'No nearby golf courses were found from your location.' }, { status: 404 })
    }

    const matchedCourses: Array<{
      id: number
      display_name: string
      club_name: string
      course_name: string
      location_label: string
      state_code: string
      tee_names: string[]
      distance_meters: number
    }> = []

    for (const candidate of candidates) {
      const searchResults = await searchGolfCourseApiByName(apiKey, candidate.name)
      const bestMatch = searchResults.find((course) => {
        const haystack = normalizeName(`${course.club_name} ${course.course_name}`)
        const needle = normalizeName(candidate.name)
        return haystack.includes(needle) || needle.includes(normalizeName(course.club_name))
      }) ?? searchResults[0]

      if (!bestMatch) {
        continue
      }

      matchedCourses.push({
        id: bestMatch.id,
        display_name: buildDisplayName(bestMatch),
        club_name: bestMatch.club_name,
        course_name: bestMatch.course_name,
        location_label: [bestMatch.location?.city, bestMatch.location?.state].filter(Boolean).join(', '),
        state_code: bestMatch.location?.state ?? '',
        tee_names: uniqueTeeNames(bestMatch),
        distance_meters: Math.round(candidate.distance_meters),
      })
    }

    const uniqueMatches = matchedCourses.filter((course, index, list) =>
      list.findIndex((entry) => entry.id === course.id) === index
    )

    if (uniqueMatches.length === 0) {
      return NextResponse.json({ error: 'Found nearby course names, but could not match them in GolfCourseAPI.' }, { status: 404 })
    }

    return NextResponse.json({
      course: uniqueMatches[0],
      alternatives: uniqueMatches,
    })
  } catch (error) {
    console.error('Nearby course route failed unexpectedly', error)
    return NextResponse.json({ error: 'Unable to determine your course right now.' }, { status: 500 })
  }
}
