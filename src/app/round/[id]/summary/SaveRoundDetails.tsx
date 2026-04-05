'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TEE_BOXES = ['Black', 'Blue', 'White', 'Gold', 'Red']

export default function SaveRoundDetails({
  roundId,
  currentCourseName,
  currentDate,
  currentTeeBox,
}: {
  roundId: string
  currentCourseName: string
  currentDate: string
  currentTeeBox: string
}) {
  const [open, setOpen] = useState(false)
  const [courseName, setCourseName] = useState(currentCourseName)
  const [date, setDate] = useState(currentDate)
  const [teeBox, setTeeBox] = useState(currentTeeBox)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('rounds')
      .update({ course_name: courseName.trim() || currentCourseName, date, tee_box: teeBox })
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

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-600">Tee Box</label>
        <div className="flex gap-2 flex-wrap">
          {TEE_BOXES.map((t) => (
            <button
              key={t}
              onClick={() => setTeeBox(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                teeBox === t ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
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
