// badgeCount, when passed, sets the app icon's badge number to that exact
// value (not an increment) - callers should pass the recipient's current
// total unread notification count so it stays in sync with the in-app bell
// even if they clear notifications there instead of via the push banner.
export async function sendPushToUser(userId: string, title: string, body: string, url?: string, badgeCount?: number) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_REST_API_KEY
  if (!appId || !apiKey) return

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_aliases: { external_id: [userId] },
      target_channel: "push",
      headings: { en: title },
      contents: { en: body },
      ...(url ? { url } : {}),
      ...(badgeCount != null ? { ios_badgeType: "SetTo", ios_badgeCount: badgeCount } : {}),
    }),
  })
  if (!res.ok) throw new Error(`OneSignal send failed: ${res.status} ${await res.text()}`)
}
