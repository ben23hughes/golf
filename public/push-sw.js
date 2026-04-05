self.addEventListener('push', (event) => {
  if (!event.data) return

  const payload = event.data.json()
  const title = payload.title || 'Golf Bet Live'
  const options = {
    body: payload.body,
    icon: '/appicon.png',
    badge: '/appicon.png',
    data: {
      url: payload.url || '/dashboard',
    },
    tag: payload.tag || 'golfbetlive-notification',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }

      return self.clients.openWindow(targetUrl)
    })
  )
})
