import '@testing-library/jest-dom/vitest'
import {vi, beforeEach, afterEach} from 'vitest'
import {cleanup} from '@testing-library/react'
import {resetFirebase} from './firebaseMock.js'
import {resetRest} from './rest.js'

// the app imports the real SDK names; these send every call to the stand-in instead
vi.mock('firebase/app', async () => (await import('./firebaseMock.js')).appModule)
vi.mock('firebase/auth', async () => (await import('./firebaseMock.js')).authModule)
vi.mock('firebase/firestore', async () => (await import('./firebaseMock.js')).firestoreModule)

// This Node build gives jsdom no localStorage, and the saved machine list depends on it.
// A Proxy is used so Object.keys(localStorage) lists the stored keys, the way a browser does
// (logout() reads it that way to drop the remembered admin).
function makeStorage() {
  const store = new Map(), k = p => String(p)
  const api = {
    getItem: p => store.has(k(p)) ? store.get(k(p)) : null,
    setItem: (p, v) => { store.set(k(p), String(v)) },
    removeItem: p => { store.delete(k(p)) },
    clear: () => { store.clear() },
    key: i => [...store.keys()][i] ?? null,
  }
  return new Proxy(api, {
    get: (t, p) => p === 'length' ? store.size : (p in t ? t[p] : (typeof p === 'string' && store.has(p) ? store.get(p) : undefined)),
    // a test may replace setItem/removeItem to act out a browser that refuses to store anything
    set: (t, p, v) => { if (p in t) { t[p] = v; return true } store.set(k(p), String(v)); return true },
    has: (t, p) => p in t || store.has(k(p)),
    deleteProperty: (t, p) => { store.delete(k(p)); return true },
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: (t, p) => store.has(k(p))
      ? {value: store.get(k(p)), enumerable:true, configurable:true, writable:true} : undefined,
  })
}
const storage = makeStorage()
Object.defineProperty(window, 'localStorage', {value: storage, configurable: true})
Object.defineProperty(globalThis, 'localStorage', {value: storage, configurable: true, writable: true})

// jsdom has no layout or media, so these exist only as stubs
window.scrollTo = vi.fn()
Element.prototype.scrollTo = vi.fn()
window.open = vi.fn()
window.confirm = vi.fn(() => true)
window.alert = vi.fn()
window.matchMedia = window.matchMedia || (q => ({matches:false, media:q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}}))
HTMLMediaElement.prototype.play = vi.fn(async () => {})

beforeEach(() => {
  resetFirebase()
  resetRest()
  localStorage.clear()
  window.scrollTo.mockClear()
  Element.prototype.scrollTo.mockClear()
  window.open.mockClear()
  window.confirm.mockClear().mockReturnValue(true)
})
afterEach(() => { cleanup() })
