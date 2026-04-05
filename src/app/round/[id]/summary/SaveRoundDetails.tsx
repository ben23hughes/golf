'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type CourseSearchResult = {
  id: number
  display_name: string
  club_name: string
  course_name: string
  location_label: string
  state_code: string
  tee_names: string[]
}

export default function SaveRoundDetails({
  canEdit = true,
  defaultOpen = false,
  roundId,
  currentCourseName,
  currentDate,
  currentNotes,
}: {
  canEdit?: boolean
  defaultOpen?: boolean
  roundId: string
  currentCourseName: string
  currentDate: string
  currentNotes: string | null
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [courseName, setCourseName] = useState(currentCourseName)
  const [date, setDate] = useState(currentDate)
  const [notes, setNotes] = useState(currentNotes ?? '')
  const [courseQuery, setCourseQuery] = useState(currentCourseName)
  const [courseResults, setCourseResults] = useState<CourseSearchResult[]>([])
  const [courseLookupError, setCourseLookupError] = useState('')
  const [searchingCourses, setSearchingCourses] = useState(false)
  const [locatingCourse, setLocatingCourse] = useState(false)
  const [courseStateCode, setCourseStateCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!canEdit) {
    return null
  }

  async function searchCourses() {
    const trimmedQuery = courseQuery.trim()
    if (trimmedQuery.length < 2) {
      setCourseLookupError('Search for at least 2 characters.')
      setCourseResults([])
      return
    }

    setCourseLookupError('')
    setSearchingCourses(true)

    try {
      const stateQuery = courseStateCode ? `&state=${encodeURIComponent(courseStateCode)}` : ''
      const response = await fetch(`/api/course-search?query=${encodeURIComponent(trimmedQuery)}${stateQuery}`)
      const data = (await response.json()) as { error?: string; courses?: CourseSearchResult[] }

      if (!response.ok) {
        setCourseLookupError(data.error ?? 'Unable to look up courses right now.')
        setCourseResults([])
        setSearchingCourses(false)
        return
      }

      setCourseResults(data.courses ?? [])
      if (!data.courses?.length) {
        setCourseLookupError('No courses matched that search.')
      }
    } catch {
      setCourseLookupError('Unable to look up courses right now.')
      setCourseResults([])
    }

    setSearchingCourses(false)
  }

  function selectCourse(course: CourseSearchResult) {
    setCourseName(course.course_name)
    setCourseQuery(course.course_name)
    setCourseResults([])
    setCourseLookupError('')
    setCourseStateCode(course.state_code)
  }

  async function locateCurrentCourse() {
    if (!navigator.geolocation) {
      setCourseLookupError('Location is not supported on this device.')
      return
    }

    setCourseLookupError('')
    setLocatingCourse(true)

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      })
    }).catch((error: GeolocationPositionError) => {
      setCourseLookupError(
        error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied.'
          : 'Unable to get your current location.'
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
        course?: CourseSearchResult
        alternatives?: CourseSearchResult[]
      }

      if (!response.ok || !data.course) {
        setCourseLookupError(data.error ?? 'Unable to match your location to a course.')
        setLocatingCourse(false)
        return
      }

      selectCourse(data.course)
      setCourseResults(data.alternatives ?? [])
    } catch {
      setCourseLookupError('Unable to match your location to a course.')
    }

    setLocatingCourse(false)
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('rounds')
      .update({ course_name: courseName.trim() || currentCourseName, date, notes: notes.trim() || null })
      .eq('id', roundId)
    setSaving(false)
    setSaved(true)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-center text-sm text-gray-400 font-medium py-2"
      >
        {saved ? `Saved as "${courseName}"` : '+ Add course & details'}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
      <h3 className="font-semibold text-gray-900">Round Details</h3>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-600">Find Course</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={courseQuery}
            onChange={(e) => setCourseQuery(e.target.value)}
            placeholder="Search GolfCourseAPI"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />
          <button
            type="button"
            onClick={() => void searchCourses()}
            className="rounded-xl bg-[#174c38] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={searchingCourses}
          >
            {searchingCourses ? 'Searching…' : 'Search'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void locateCurrentCourse()}
          className="rounded-xl border border-[#174c38] px-4 py-3 text-sm font-semibold text-[#174c38] disabled:opacity-50"
          disabled={locatingCourse}
        >
          {locatingCourse ? 'Locating…' : 'Use My Location'}
        </button>
        <p className="text-xs text-gray-500">
          Uses your location to find nearby course names, then matches the closest result through GolfCourseAPI.
        </p>
        {courseLookupError && (
          <p className="text-xs font-medium text-[#a34d2d]">{courseLookupError}</p>
        )}
        {courseStateCode && (
          <p className="text-xs text-gray-500">Search is currently narrowed to {courseStateCode}.</p>
        )}
        {courseResults.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-gray-100">
            {courseResults.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => selectCourse(course)}
                className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{course.display_name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {course.location_label || 'Location unavailable'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#174c38]">Use</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-600">Course Name</label>
        <input
          type="text"
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          placeholder="Pebble Beach Golf Links"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-600">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-600">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="House rules, side bets, presses, junk, or anything else worth keeping with the round."
          className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base transition focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 border border-gray-200 text-gray-500 py-3 rounded-xl font-medium text-sm"
        >
          Cancel
        </button>
        <button
          disabled={saving}
          onClick={save}
          className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 active:bg-green-700 transition"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
