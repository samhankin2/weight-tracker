/**
 * PWA glue: service-worker registration.
 *
 * Kept in its own module so the app shell bootstrap stays untouched. The
 * service worker itself lives at `public/sw.js` and is copied verbatim into
 * the build output, so it is always served from the deploy root next to
 * index.html.
 *
 * Wire it up from `src/main.ts` (once, at bootstrap):
 *
 *     import { registerServiceWorker } from './pwa'
 *     ...
 *     registerServiceWorker()
 *
 * Registration is deliberately fire-and-forget: a failure here must never
 * break the app, and the app must stay fully usable without a service worker.
 */

/** Guards against double registration if bootstrap runs twice (e.g. HMR). */
let started = false

/**
 * Register `sw.js` in production only, so `npm run dev` keeps its normal
 * no-cache / HMR behaviour.
 *
 * The URL is resolved against `import.meta.env.BASE_URL` (`./` for this
 * project) so it also works from a GitHub Pages project subpath such as
 * https://user.github.io/weight-tracker/.
 */
export function registerServiceWorker(): void {
  if (started) return
  if (!import.meta.env.PROD) return

  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    started = true

    const register = (): void => {
      try {
        const swUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href)
        navigator.serviceWorker.register(swUrl.href).catch((error: unknown) => {
          console.warn('[pwa] Service worker registration failed; running online-only.', error)
        })
      } catch (error) {
        console.warn('[pwa] Could not resolve the service worker URL.', error)
      }
    }

    // Wait for `load` so the worker install never competes with first paint.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  } catch (error) {
    console.warn('[pwa] Service worker setup failed; running online-only.', error)
  }
}
