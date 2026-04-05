import webpush, { type PushSubscription } from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

type RoundInvitePushPayload = {
  title: string
  body: string
  url: string
  tag: string
}

type StoredPushSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:hello@golfbetlive.com'

  if (!publicKey || !privateKey) {
    return false
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

export async function sendRoundInvitePush(
  invitedUserIds: string[],
  payload: RoundInvitePushPayload
) {
  if (invitedUserIds.length === 0 || !configureWebPush()) return

  const admin = createAdminClient()
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', invitedUserIds)

  if (error || !subscriptions?.length) {
    if (error) {
      console.error('Failed to load push subscriptions', error)
    }
    return
  }

  const invalidEndpoints: string[] = []
  const body = JSON.stringify(payload)

  await Promise.all(
    (subscriptions as StoredPushSubscription[]).map(async (subscription) => {
      const pushSubscription: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }

      try {
        await webpush.sendNotification(pushSubscription, body)
      } catch (pushError) {
        const statusCode =
          typeof pushError === 'object' &&
          pushError !== null &&
          'statusCode' in pushError &&
          typeof pushError.statusCode === 'number'
            ? pushError.statusCode
            : null

        console.error('Failed to send web push', pushError)

        if (statusCode === 404 || statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint)
        }
      }
    })
  )

  if (invalidEndpoints.length > 0) {
    await admin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', invalidEndpoints)
  }
}
