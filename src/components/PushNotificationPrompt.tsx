'use client'

import { useEffect, useMemo, useState } from 'react'

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function base64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

export default function PushNotificationPrompt() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const vapidKeyAvailable = useMemo(() => PUBLIC_VAPID_KEY.length > 0, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    setSupported(isSupported)
    if (!isSupported) return

    setPermission(Notification.permission)

    void navigator.serviceWorker.getRegistration().then(async (registration) => {
      if (!registration) {
        setEnabled(false)
        return
      }

      const subscription = await registration.pushManager.getSubscription()
      setEnabled(Boolean(subscription))
    })
  }, [])

  async function enableNotifications() {
    if (!supported || !vapidKeyAvailable) {
      setMessage('Push notifications are not configured yet.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)

      if (permissionResult !== 'granted') {
        setMessage('Notification permission was not granted.')
        return
      }

      const registration = await navigator.serviceWorker.register('/push-sw.js')
      const existingSubscription = await registration.pushManager.getSubscription()
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(PUBLIC_VAPID_KEY),
        }))

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to save push subscription.')
      }

      setEnabled(true)
      setMessage('Notifications enabled. You will get alerted when someone adds you to a round.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to enable notifications.')
    } finally {
      setLoading(false)
    }
  }

  async function disableNotifications() {
    setLoading(true)
    setMessage('')

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()

      if (!subscription) {
        setEnabled(false)
        return
      }

      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })

      await subscription.unsubscribe()
      setEnabled(false)
      setMessage('Notifications disabled.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to disable notifications.')
    } finally {
      setLoading(false)
    }
  }

  if (!supported) return null

  return (
    <div className="surface-card px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="section-label">Notifications</p>
          <p className="mt-2 font-semibold text-[#112218]">Get round invites instantly.</p>
          <p className="mt-1 text-sm text-[#5a6758]">
            Turn on push notifications so Golf Bet Live can alert you when someone adds you to a round.
          </p>
          {!vapidKeyAvailable && (
            <p className="mt-2 text-xs text-[#a34d2d]">Missing VAPID push configuration on the server.</p>
          )}
          {message && <p className="mt-2 text-sm text-[#174c38]">{message}</p>}
        </div>
        <span className={`status-chip ${enabled ? 'bg-[#dce8df] text-[#174c38]' : 'bg-[#ece5d6] text-[#6f695a]'}`}>
          {enabled ? 'On' : permission === 'denied' ? 'Blocked' : 'Off'}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void enableNotifications()}
          disabled={loading || enabled || permission === 'denied' || !vapidKeyAvailable}
          className="primary-button flex-1 disabled:opacity-50"
        >
          {loading && !enabled ? 'Enabling…' : enabled ? 'Enabled' : 'Enable Notifications'}
        </button>
        {enabled && (
          <button
            type="button"
            onClick={() => void disableNotifications()}
            disabled={loading}
            className="secondary-button disabled:opacity-50"
          >
            Turn Off
          </button>
        )}
      </div>
    </div>
  )
}
