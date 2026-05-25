const CACHE = 'runkub-shell-v1'

// External hostnames we never want to cache
const BYPASS = [
  'supabase.co',
  'mapbox.com',
  'api.mapbox.com',
  'events.mapbox.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]

// Never intercept Next.js internal requests (HMR, Turbopack, RSC)
const BYPASS_PATHS = ['/_next/', '/__nextjs', '/webpack-hmr']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.json']))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Only handle GET requests from this origin or same-origin static assets
  if (request.method !== 'GET') return
  if (BYPASS.some((host) => url.hostname.includes(host))) return
  if (BYPASS_PATHS.some((p) => url.pathname.startsWith(p))) return

  if (request.mode === 'navigate') {
    // Navigation: network first, fall back to cached shell
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(request, clone))
          return res
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    )
    return
  }

  // Static assets (_next/static, fonts, images): cache first, fill from network
  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons') ||
    /\.(woff2?|ttf|otf|svg|png|jpg|webp|ico)$/.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(request, clone))
          }
          return res
        })
      })
    )
  }
})
