import {initializeApp} from 'firebase/app'
import {initializeFirestore} from 'firebase/firestore'
const e = import.meta.env
const cfg = {apiKey:e.VITE_FIREBASE_API_KEY,authDomain:e.VITE_FIREBASE_AUTH_DOMAIN,projectId:e.VITE_FIREBASE_PROJECT_ID,appId:e.VITE_FIREBASE_APP_ID}
// With the VITE_FIREBASE_* values empty, getAuth() throws while this file is still loading, before React draws anything,
// and the whole website is a blank page. So without them Firebase is skipped: Home, About and the machines keep working
// from the built-in machine in data.js, and the pages that need an account say so (see `configured` in auth.jsx,
// machines.jsx and pages.jsx). Fill .env to turn accounts, enquiries and the admin page back on.
export const configured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId)
const app = configured ? initializeApp(cfg) : null
// Force long polling: auto-detect waits ~10 s before falling back, which is longer than our request timeouts,
// so on networks that block the default connection every request timed out (app/timeout).
export const db = configured ? initializeFirestore(app, {experimentalForceLongPolling: true}) : null

// Signing in is about a quarter of the Firebase code, and most people who open the website never do it.
// So that part is fetched only when it is needed, instead of with the first page. Loaded once, then shared.
let loading = null
export const loadAuth = () => {
  if (!configured) return Promise.resolve(null)
  return loading || (loading = import('firebase/auth').then(sdk => ({sdk, auth: sdk.getAuth(app)})))
}

// Remembers that somebody signed in on this device, so a return visit restores the session straight away
// while a first-time visitor never fetches the sign-in code at all.
const KEY = 'sm_session'
export const hasSession = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
export const setSession = on => { try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY) } catch {} }
