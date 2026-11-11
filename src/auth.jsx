import {createContext,useContext,useEffect,useRef,useState} from 'react'
import {doc,getDocFromServer} from 'firebase/firestore'
import {configured,db,hasSession,loadAuth,setSession} from './firebase'
// true: the emailed link must be clicked before the account can be used (keep verified() in firestore.rules strict as well).
// false: anyone with a working email can log in at once. If you switch this to false, relax verified() in firestore.rules too.
export const REQUIRE_VERIFIED = true
export const withTimeout = (pr, ms = 20000) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), {code:'app/timeout'})), ms))])
const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
// the signed-in person, once the sign-in code has been fetched
const currentUser = async () => (await loadAuth())?.auth.currentUser || null
const idToken = async () => (await currentUser()).getIdToken()
// Direct calls to the Firestore REST API with the signed-in user's token. The same security rules apply.
// Used for the admin check and setup, because it still works when a blocker or network stops the SDK's live connection.
const fsBase = () => 'https://firestore.googleapis.com/v1/projects/' + import.meta.env.VITE_FIREBASE_PROJECT_ID + '/databases/(default)/documents'
const restErr = async r => { let m = ''; try { m = (await r.json()).error?.message } catch {} ; return Object.assign(new Error(m || ('HTTP ' + r.status)), {code: r.status === 403 ? 'permission-denied' : 'http-' + r.status}) }
export async function restGet(path, ms = 15000) {   // returns the document, or null when it does not exist
  const t = await idToken()
  const r = await withTimeout(fetch(fsBase() + '/' + path, {headers:{Authorization:'Bearer ' + t}}), ms)
  if (r.status === 404) return null
  if (!r.ok) throw await restErr(r)
  return r.json()
}
export async function restGetPublic(path) {   // for documents the rules allow everyone to read
  const r = await withTimeout(fetch(fsBase() + '/' + path + '?key=' + import.meta.env.VITE_FIREBASE_API_KEY), 15000)
  if (r.status === 404) return null
  if (!r.ok) throw await restErr(r)
  return r.json()
}
// one shared admin check per account, so login and the auth listener do not ask the database twice
const pending = {}
const adminDoc = uid => pending[uid] || (pending[uid] = restGet('admins/' + uid, 6000).then(d => d !== null, e => { delete pending[uid]; throw e }).then(v => { setTimeout(() => { delete pending[uid] }, 2000); return v }))
// the signed-in user's own enquiries, in one fast REST call
export async function restMyEnquiries(uid) {
  const t = await idToken()
  const r = await withTimeout(fetch(fsBase() + ':runQuery', {method:'POST', headers:{Authorization:'Bearer ' + t, 'Content-Type':'application/json'}, body:JSON.stringify({structuredQuery:{from:[{collectionId:'enquiries'}], where:{fieldFilter:{field:{fieldPath:'uid'}, op:'EQUAL', value:{stringValue:uid}}}}})}), 15000)
  if (!r.ok) throw await restErr(r)
  return (await r.json()).filter(x => x.document).map(x => {
    const f = x.document.fields || {}, g = k => f[k]?.stringValue || '', ts = f.createdAt?.timestampValue
    return {machineId:g('machineId'), message:g('message'), createdAt: ts ? {seconds:Date.parse(ts) / 1000, toDate:() => new Date(ts)} : null}
  }).sort((p, q) => (q.createdAt?.seconds || 0) - (p.createdAt?.seconds || 0))
}
export async function restCreate(collection, id, fields) {
  const t = await idToken()
  const f = {}
  for (const k in fields) f[k] = k === 'createdAt' ? {timestampValue:new Date().toISOString()} : {stringValue:String(fields[k])}
  const r = await withTimeout(fetch(fsBase() + '/' + collection + '?documentId=' + encodeURIComponent(id), {method:'POST', headers:{Authorization:'Bearer ' + t, 'Content-Type':'application/json'}, body:JSON.stringify({fields:f})}), 15000)
  if (!r.ok) throw await restErr(r)
}
 const ckey = uid => 'sm_admin_' + uid
const readCache = uid => { try { return localStorage.getItem(ckey(uid)) === '1' } catch { return false } }
const writeCache = (uid, v) => { try { v ? localStorage.setItem(ckey(uid), '1') : localStorage.removeItem(ckey(uid)) } catch {} }
// try a database call a few times; a rules refusal is final, a timeout or a network hiccup is retried
export const retry = async (fn, tries = 3) => {
  let last
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) { last = e; if (e.code === 'permission-denied') throw e; await new Promise(r => setTimeout(r, 700 * (i + 1))) }
  }
  throw last
}
// tells the owner exactly why the database cannot be reached
export async function diagnose() {
  const e = import.meta.env, pid = e.VITE_FIREBASE_PROJECT_ID, key = e.VITE_FIREBASE_API_KEY, out = []
  if (!pid || !key || !e.VITE_FIREBASE_APP_ID) return [{ok:false, t:'Firebase settings are missing in this build. Fill the VITE_FIREBASE_* values in .env, then run npm run build again.'}]
  out.push({ok:true, t:'Project: ' + pid})
  try {
    const r = await withTimeout(fetch('https://firestore.googleapis.com/v1/projects/' + pid + '/databases/(default)/documents/machines?pageSize=1&key=' + key), 12000)
    if (r.ok) out.push({ok:true, t:'Database is reachable and the rules are published.'})
    else if (r.status === 404) out.push({ok:false, t:'The Firestore database is not created in this project. Firebase console > Build > Firestore Database > Create database.'})
    else if (r.status === 403) out.push({ok:false, t:'The database refused the request. Publish firestore.rules, and check the Cloud Firestore API is enabled for this project.'})
    else if (r.status === 400) out.push({ok:false, t:'Firebase rejected the API key or project settings (status 400). Re-copy the values from Project settings > Your apps.'})
    else out.push({ok:false, t:'The database answered with status ' + r.status + '.'})
  } catch { out.push({ok:false, t:'Cannot reach firestore.googleapis.com. Check the internet, turn off VPN or ad blocker, or try another network.'}) }
  try { await withTimeout(getDocFromServer(doc(db,'machines','probe')), 12000); out.push({ok:true, t:'Live connection (used for machines and enquiries) works.'}) }
  catch (x) { out.push({ok:false, t:'Live connection is blocked (' + (x.code || x.message) + '). Turn off ad blocker, Brave Shields, VPN or antivirus web protection for this site, or try Incognito. Machines and enquiries need this connection.'}) }
  return out
}
export function AuthProvider({children}) {
  const [user,setUser] = useState(null), [profile,setProfile] = useState(null), [isAdmin,setAdmin] = useState(false), [loading,setLoading] = useState(true), [adminChecked,setAdminChecked] = useState(false), [adminError,setAdminError] = useState('')
  const busy = useRef(false)   // true while the admin setup is creating the account, so the listener does not interfere
  const watching = useRef(null)   // the live auth listener, attached at most once
  const starting = useRef(null)   // the in-flight fetch of the sign-in code, shared by everything that needs it
  const gone = useRef(false)      // true once this provider has been taken off the page
  // checks the admins collection; remembers a confirmed admin on this device so the Admin page opens at once next time
  const checkAdmin = async (uid, silent) => {
    if (!silent) setAdminChecked(false)
    setAdminError('')
    try {
      const ok = await retry(() => adminDoc(uid), 2)
      setAdmin(ok); writeCache(uid, ok); return ok
    } catch (e) {
      setAdminError(e.code || e.message || 'unknown')
      return readCache(uid)
    } finally { setAdminChecked(true) }
  }
  // isAdm = true when we already know this account is the admin (admins never need email verification)
  const activate = (u, isAdm) => {
    setUser(u); setLoading(false)   // never make the page wait for the database
    setProfile({email:u.email})
    setSession(true)                // a return visit now restores this session at once
    if (isAdm) { setAdmin(true); setAdminError(''); setAdminChecked(true); writeCache(u.uid, true) }
    else {
      const known = readCache(u.uid)
      setAdmin(known); setAdminChecked(known)
      // An owner has no profile document - /admin/setup never writes one - so asking for one is a wasted
      // round trip that answers 404 and logs an error in the console. Which this is only becomes clear
      // once the admin check answers, so the profile waits for it rather than guessing: on a device that
      // already remembers the owner nothing is asked for, and on the owner's first login here nothing is
      // either. A member pays one extra round trip before their name appears, and no page waits for it.
      checkAdmin(u.uid, known).then(owner => {
        if (owner) return
        return restGet('users/' + u.uid).then(d => { const f = d?.fields; if (f) setProfile({name:f.name?.stringValue, mobile:f.mobile?.stringValue, email:f.email?.stringValue || u.email}) })
      }).catch(() => {})
    }
  }
  const deny = () => { setUser(null); setLoading(false); setProfile(null); setAdmin(false); setAdminError(''); setAdminChecked(true); setSession(false) }

  // Fetches the sign-in code and starts watching, once. Everything that needs an account goes through
  // here, so a visitor who only reads the website never downloads it.
  // The whole thing is shared as one promise: fetching the code takes real time, and two callers that
  // arrived during it would each have found no listener and attached one, leaving a second listener
  // nobody can ever detach. A failed fetch clears the share so the next caller can try again.
  const ensure = () => starting.current || (starting.current = loadAuth().then(a => {
    if (!a) return null
    if (!watching.current && !gone.current) {
      let seq = 0
      watching.current = a.sdk.onAuthStateChanged(a.auth, async u => {
        const my = ++seq
        if (busy.current) return
        if (!u) return deny()
        if (u.emailVerified || !REQUIRE_VERIFIED) return activate(u)
        // not verified: only the admin may continue without verification; everybody else must verify first
        let adm = readCache(u.uid)
        try { adm = await retry(() => adminDoc(u.uid), 2) } catch {}
        if (my !== seq || busy.current) return
        adm ? activate(u, true) : deny()
      })
    }
    return a
  }, e => { starting.current = null; throw e }))

  useEffect(() => {
    if (!configured) { deny(); return }   // no Firebase settings: nobody is logged in, so never touch auth or the database
    if (!hasSession()) { deny(); return } // nobody has signed in on this device, so leave the sign-in code alone
    ensure().catch(() => deny())
    return () => { gone.current = true; watching.current?.(); watching.current = null }
  }, [])

  const refreshAdmin = async () => {
    const u = await currentUser()
    return u ? checkAdmin(u.uid) : false
  }
  const register = async (name,mobile,email,pw) => {
    const a = await ensure()
    const c = await a.sdk.createUserWithEmailAndPassword(a.auth,email,pw)
    const p = {name,mobile,email}
    setProfile(p)
    restCreate('users', c.user.uid, p).catch(e => console.warn('Profile not saved:', e.code || e.message))   // saved in the background
    if (REQUIRE_VERIFIED) try { await a.sdk.sendEmailVerification(c.user) } catch (e) { console.warn('Verification email not sent:', e.code || e.message) }
  }
  // returns {user, admin}. The admin never has to verify an email; a normal user does.
  // Login never waits long for the database: the admin check gets at most 2.5 s (4 s if the email is not verified yet).
  // If it is slower, the person is let in as a normal user and the page moves to Admin by itself once the check finishes.
  const login = async (email,pw) => {
    const a = await ensure()
    const u = (await a.sdk.signInWithEmailAndPassword(a.auth,email,pw)).user
    let admin = readCache(u.uid)
    if (!admin) {
      const unverified = REQUIRE_VERIFIED && !u.emailVerified
      try { admin = await Promise.race([adminDoc(u.uid), new Promise((_, no) => setTimeout(() => no(new Error('slow')), unverified ? 4000 : 2500))]); writeCache(u.uid, admin) } catch { admin = false }
    }
    return {user:u, admin}
  }
  // First-time owner setup: creates the admin login (no email check, no verification) and closes the setup.
  const claimAdmin = async (email,pw,code) => {
    const a = await ensure()
    busy.current = true
    let u, created = false
    try {
      try { u = (await a.sdk.createUserWithEmailAndPassword(a.auth,email,pw)).user; created = true }
      catch (e) { if (e.code === 'auth/email-already-in-use') u = (await a.sdk.signInWithEmailAndPassword(a.auth,email,pw)).user; else throw e }
      try { await retry(() => restCreate('admins', u.uid, {code, email:u.email, createdAt:1}), 2) }
      catch (e) { if (created) { try { await a.sdk.deleteUser(u) } catch {} } else { try { await a.sdk.signOut(a.auth) } catch {} } throw e }
      try { await retry(() => restCreate('meta', 'adminSetup', {done:'1', createdAt:1}), 3) } catch (x) { console.warn('Setup lock not saved:', x.code || x.message) }
    } catch (e) { busy.current = false; throw e }
    busy.current = false
    activate(u, true)
  }
  const resendVerification = async () => {
    const a = await ensure()
    if (a?.auth.currentUser) await a.sdk.sendEmailVerification(a.auth.currentUser)
  }
  const checkVerified = async () => {
    const u = await currentUser()
    if (!u) return false
    await u.reload()
    if (!u.emailVerified) return false
    await u.getIdToken(true)
    activate(u); return true
  }
  const logout = async () => {
    try { Object.keys(localStorage).filter(k => k.startsWith('sm_admin_')).forEach(k => localStorage.removeItem(k)) } catch {}
    const a = await ensure()
    if (a) await a.sdk.signOut(a.auth)
    setSession(false)
  }
  // sends the reset link; falls back to a plain link if this domain is not yet in Firebase "Authorized domains"
  const reset = async email => {
    const a = await ensure()
    try { await a.sdk.sendPasswordResetEmail(a.auth, email, {url: window.location.origin + '/login'}) }
    catch (e) { if (e.code === 'auth/unauthorized-continue-uri' || e.code === 'auth/invalid-continue-uri') await a.sdk.sendPasswordResetEmail(a.auth, email); else throw e }
  }
  return <Ctx.Provider value={{user,profile,isAdmin,loading,adminChecked,refreshAdmin,adminError,register,login,claimAdmin,logout,reset,resendVerification,checkVerified}}>{children}</Ctx.Provider>
}
export const authError = e => ({
  'auth/email-already-in-use':'This email is already registered. Log in instead.',
  'auth/invalid-credential':'Email or password is incorrect.',
  'auth/wrong-password':'Email or password is incorrect.',
  'auth/user-not-found':'Email or password is incorrect.',
  'auth/weak-password':'Password must be at least 6 characters.',
  'auth/invalid-email':'Enter a valid email address.',
  'auth/user-disabled':'This account has been disabled.',
  'auth/network-request-failed':'No internet connection. Try again.',
  'auth/too-many-requests':'Too many attempts. Try again later.',
  'auth/configuration-not-found':'Login is not set up yet. Enable Email/Password in Firebase Authentication.',
  'app/timeout':'The database did not respond. Check that Firestore is created and the rules are published.',
  'unavailable':'The database is not reachable. Check that Firestore is created and your internet is working.',
  'permission-denied':'The database refused this. Publish the rules from firestore.rules in Firebase.'
}[e.code] || ('Something went wrong (' + (e.code || e.message) + '). Please try again.'))
