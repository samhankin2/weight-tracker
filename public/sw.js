/**
 * Weight Tracker — offline service worker.
 *
 * Design notes
 * ------------
 * Vite gives bundled assets content-hashed filenames, so this file cannot
 * hardcode them and there is no build manifest to read at runtime. Instead:
 *
 *   1. The app shell is precached by name (it is stable across builds).
 *   2. At install time the freshly precached index.html is scanned for its
 *      <script src> / <link href> asset URLs and those are precached too.
 *      This is what makes a *cold* offline reload work after a single visit,
 *      without needing to know the hashes ahead of time.
 *   3. Anything else same-origin is cached on demand (stale-while-revalidate).
 *
 * All URLs are resolved against the registration scope, so this works under a
 * GitHub Pages project subpath (https://user.github.io/<repo>/) as well as at
 * a domain root.
 *
 * Strategies
 * ----------
 *   navigations        -> network-first, fall back to the cached shell
 *   static same-origin -> stale-while-revalidate
 */

'use strict'

/** Bump to invalidate every cached asset on the next deploy. */
const CACHE_VERSION = 'v1'
const CACHE_NAME = `weight-tracker-shell-${CACHE_VERSION}`

/** Stable app-shell entries, relative to the registration scope. */
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
]

/** Resolve an app-relative path against the SW scope. */
function appUrl(path) {
  return new URL(path, self.registration.scope).href
}

const SHELL_URL = () => appUrl('./index.html')
const SCOPE_URL = () => self.registration.scope

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

/** True for the app root or its index.html, in any query-string flavour. */
function isShellDocument(url) {
  const root = new URL(SCOPE_URL())
  return url.pathname === root.pathname || url.pathname === `${root.pathname}index.html`
}

// ---------------------------------------------------------------------------
// Install: precache the shell, then its hashed build assets.
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)

      // Individual adds (not addAll) so one missing file cannot fail the whole
      // install and leave the app without a service worker.
      await Promise.allSettled(
        SHELL_ASSETS.map((path) => cache.add(new Request(appUrl(path), { cache: 'reload' }))),
      )

      // Discover the hashed JS/CSS referenced by the shell we just cached.
      await precacheShellAssets(cache)

      await self.skipWaiting()
    })(),
  )
})

/**
 * Parse the cached index.html for same-origin script/link targets and cache
 * them. Best effort: any failure just means those assets will be cached on
 * first use instead.
 */
async function precacheShellAssets(cache) {
  try {
    const shellResponse = await cache.match(SHELL_URL())
    if (!shellResponse) return

    const html = await shellResponse.text()
    const pattern = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*"([^"]+)"/gi
    const shellUrl = SHELL_URL()
    const targets = new Set()

    for (const match of html.matchAll(pattern)) {
      const raw = match[1]
      if (!raw || raw.startsWith('data:') || raw.startsWith('mailto:') || raw.startsWith('#')) continue
      let url
      try {
        url = new URL(raw, shellUrl)
      } catch {
        continue
      }
      if (!isSameOrigin(url)) continue
      // The manifest is already precached; skip the SW itself.
      if (url.pathname.endsWith('/sw.js')) continue
      targets.add(url.href)
    }

    await Promise.allSettled(
      [...targets].map((href) => cache.add(new Request(href, { cache: 'reload' }))),
    )
  } catch {
    // Non-fatal: offline will still work once the assets have been fetched.
  }
}

// ---------------------------------------------------------------------------
// Activate: drop caches from previous versions.
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever touch same-origin GETs.
  if (request.method !== 'GET') return
  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }
  if (!isSameOrigin(url)) return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  // Never intercept the worker script itself — the browser manages updates.
  if (url.pathname.endsWith('/sw.js')) return
  // Range requests (media) are not safely cacheable.
  if (request.headers.has('range')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request, event, url))
    return
  }

  event.respondWith(staleWhileRevalidate(request, event))
})

/**
 * Network-first for navigations so a deploy is picked up immediately, with the
 * cached shell as the offline fallback (so a cold offline reload still boots).
 */
async function networkFirstNavigation(request, event, url) {
  try {
    const response = await fetch(request)
    if (response && response.ok && response.type === 'basic') {
      // Keep the precached shell document fresh across deploys.
      if (isShellDocument(url)) {
        const copy = response.clone()
        event.waitUntil(
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(SHELL_URL(), copy))
            .catch(() => {}),
        )
      }
    }
    return response
  } catch {
    const cached =
      (await caches.match(SHELL_URL(), { ignoreSearch: true })) ??
      (await caches.match(SCOPE_URL(), { ignoreSearch: true }))

    if (cached) {
      // The shell's asset URLs are relative, so serving it at an arbitrary
      // in-scope path would resolve them against the wrong base and the app
      // would never boot. Send the browser to the app root instead, where the
      // cached shell is served correctly.
      if (!isShellDocument(url)) return Response.redirect(SCOPE_URL(), 302)
      return cached
    }

    return offlineFallback()
  }
}

/**
 * Stale-while-revalidate for static assets: answer from cache immediately when
 * possible, refresh in the background for next time.
 */
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const network = fetch(request).then((response) => {
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone()
      event.waitUntil(cache.put(request, copy).catch(() => {}))
    }
    return response
  })

  if (cached) {
    // Refresh in the background; a failed revalidation must not reject.
    event.waitUntil(network.catch(() => {}))
    return cached
  }

  try {
    return await network
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' })
  }
}

/** Last-resort document when neither the network nor the shell is available. */
function offlineFallback() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Offline</title><body style="font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;' +
      'place-items:center;min-height:100vh;background:#f3f5f1;color:#19231f">' +
      '<p>You are offline and the app has not finished caching yet.</p>',
    {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  )
}
