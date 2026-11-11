// A stand-in for the Firebase SDK. The real one needs a project and a network; these tests need
// neither. Every call the app makes is recorded here so a test can drive it and then check it.
import {vi} from 'vitest'

// The app now fetches firebase/auth on demand, so this module can be evaluated a second time after
// vi.resetModules(). The state has to be one shared object or the app would end up talking to a
// different stand-in than the test is setting up.
export const fb = globalThis.__smFirebaseMock || (globalThis.__smFirebaseMock = {
  _currentUser: null,
  authListeners: [],
  snapshots: {},   // collection name -> {next, error}
  stores: {},      // collection name -> Map(id -> data)
  writes: [],      // {op, collection, id, data}
  emails: [],      // verification / reset mails the app asked for
  fail: {},        // e.g. {signIn:'auth/invalid-credential'}
  seq: 0,
})

export function resetFirebase() {
  // auth.jsx keeps a short-lived cache of the admin check keyed by uid, so each test gets its own account
  fb.uid = 'uid-' + (++fb.seq)
  fb.currentUser = null
  fb.authListeners = []
  fb.snapshots = {}
  fb.stores = {}
  fb.writes = []
  fb.emails = []
  fb.fail = {}
}

// Signing somebody in also records that a session exists on this device - the app reads that marker to
// decide whether to fetch the sign-in code at all - so the stand-in keeps the two in step.
if (!Object.getOwnPropertyDescriptor(fb, 'currentUser')) Object.defineProperty(fb, 'currentUser', {
  get() { return fb._currentUser },
  set(u) {
    fb._currentUser = u
    try { u ? localStorage.setItem('sm_session', '1') : localStorage.removeItem('sm_session') } catch {}
  },
})

const err = code => Object.assign(new Error(code), {code})
const notify = () => fb.authListeners.forEach(cb => cb(fb.currentUser))

export function makeUser(over = {}) {
  return {uid: fb.uid || 'uid-1', email:'user@example.com', emailVerified:true,
    getIdToken: vi.fn(async () => 'token'), reload: vi.fn(async () => {}), ...over}
}

// lets a test push a machines list (or any collection) to whoever is listening
export function emitSnapshot(name, docs, {fromCache = false} = {}) {
  const l = fb.snapshots[name]
  if (!l) return false
  l.next({
    size: docs.length, empty: docs.length === 0,
    metadata: {fromCache, hasPendingWrites:false},
    docs: docs.map(d => ({id:d.id, data: () => d.data})),
  })
  return true
}
export function emitSnapshotError(name, code = 'unavailable') {
  const l = fb.snapshots[name]
  if (l && l.error) l.error(err(code))
}

export const appModule = {initializeApp: vi.fn(() => ({name:'[DEFAULT]'}))}

export const authModule = {
  getAuth: vi.fn(() => ({get currentUser() { return fb.currentUser }})),
  onAuthStateChanged: vi.fn((auth, cb) => {
    fb.authListeners.push(cb)
    Promise.resolve().then(() => cb(fb.currentUser))
    return () => { fb.authListeners = fb.authListeners.filter(x => x !== cb) }
  }),
  signInWithEmailAndPassword: vi.fn(async (auth, email) => {
    if (fb.fail.signIn) throw err(fb.fail.signIn)
    fb.currentUser = makeUser({email, ...(fb.nextUser || {})})
    notify(); return {user: fb.currentUser}
  }),
  createUserWithEmailAndPassword: vi.fn(async (auth, email) => {
    if (fb.fail.create) throw err(fb.fail.create)
    fb.currentUser = makeUser({email, emailVerified:false, ...(fb.nextUser || {})})
    notify(); return {user: fb.currentUser}
  }),
  signOut: vi.fn(async () => { fb.currentUser = null; notify() }),
  sendEmailVerification: vi.fn(async u => { fb.emails.push({kind:'verify', to:u?.email}) }),
  sendPasswordResetEmail: vi.fn(async (auth, email) => {
    if (fb.fail.reset) throw err(fb.fail.reset)
    fb.emails.push({kind:'reset', to:email})
  }),
  deleteUser: vi.fn(async () => { fb.currentUser = null; notify() }),
}

const nameOf = ref => ref && (ref.__name || (ref.__ref && ref.__ref.__name))

export const firestoreModule = {
  initializeFirestore: vi.fn(() => ({__db:true})),
  collection: vi.fn((db, name) => ({__name:name})),
  doc: vi.fn((db, name, id) => ({__name:name, __id:id})),
  query: vi.fn((ref, ...parts) => ({__name:nameOf(ref), __parts:parts})),
  where: vi.fn((f, op, v) => ({__where:[f, op, v]})),
  orderBy: vi.fn((f, dir) => ({__orderBy:[f, dir]})),
  serverTimestamp: vi.fn(() => ({__serverTimestamp:true})),
  onSnapshot: vi.fn((ref, next, error) => {
    fb.snapshots[nameOf(ref)] = {next, error}
    return () => { delete fb.snapshots[nameOf(ref)] }
  }),
  addDoc: vi.fn(async (ref, data) => {
    if (fb.fail.write) throw err(fb.fail.write)
    const id = 'doc-' + (fb.writes.length + 1)
    fb.writes.push({op:'add', collection:nameOf(ref), id, data}); return {id}
  }),
  setDoc: vi.fn(async (ref, data) => {
    if (fb.fail.write) throw err(fb.fail.write)
    fb.writes.push({op:'set', collection:ref.__name, id:ref.__id, data})
  }),
  deleteDoc: vi.fn(async ref => {
    if (fb.fail.write) throw err(fb.fail.write)
    fb.writes.push({op:'delete', collection:ref.__name, id:ref.__id})
  }),
  getDocs: vi.fn(async ref => {
    const rows = [...(fb.stores[nameOf(ref)] || new Map()).entries()]
    return {docs: rows.map(([id, data]) => ({id, data: () => data}))}
  }),
  getDocFromServer: vi.fn(async () => ({exists: () => false})),
}
