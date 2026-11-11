import {describe, it, expect, vi, beforeEach} from 'vitest'
import {screen, act, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'
import {onRest} from '../test/rest.js'
import {diagnose} from '../auth.jsx'
import {checkEmail} from '../emailcheck.js'

const CK = 'sm_machines_v1'
const settle = async (docs = [machineDoc('m1')]) => act(async () => { emitSnapshot('machines', docs) })

// ---------------------------------------------------------------- redirect back
describe('TC-GP-R: going back to the page you asked for', () => {
  it('TC-GP-R-01 logging in from a protected page returns you to that page', async () => {
    renderApp('/enquire/m1')                       // a visitor is sent to the login form
    await screen.findByText(/Log in to send your enquiry/i)
    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    await settle()
    // not the dashboard: the enquiry they originally wanted
    expect(await screen.findByRole('heading', {name:/Enquiry form/i})).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------- diagnose
describe('TC-GP-X: telling the owner why the database cannot be reached', () => {
  const run = async (fetchImpl, probeRejects) => {
    global.fetch = vi.fn(fetchImpl)
    const {getDocFromServer} = await import('firebase/firestore')
    if (probeRejects) getDocFromServer.mockRejectedValueOnce(Object.assign(new Error('blocked'), {code:'unavailable'}))
    return (await diagnose()).map(x => x.t).join(' | ')
  }

  it('TC-GP-X-01 reports a database that has not been created', async () => {
    const out = await run(async () => new Response('{}', {status:404}))
    expect(out).toMatch(/not created in this project/i)
  })
  it('TC-GP-X-02 reports rules that have not been published', async () => {
    const out = await run(async () => new Response('{}', {status:403}))
    expect(out).toMatch(/refused the request/i)
    expect(out).toMatch(/firestore\.rules/i)
  })
  it('TC-GP-X-03 reports settings Firebase rejected', async () => {
    const out = await run(async () => new Response('{}', {status:400}))
    expect(out).toMatch(/rejected the API key or project settings/i)
  })
  it('TC-GP-X-04 reports any other answer with its status', async () => {
    const out = await run(async () => new Response('{}', {status:503}))
    expect(out).toMatch(/answered with status 503/)
  })
  it('TC-GP-X-05 reports a network that cannot be reached at all', async () => {
    const out = await run(async () => { throw new Error('offline') })
    expect(out).toMatch(/Cannot reach firestore\.googleapis\.com/i)
  })
  it('TC-GP-X-06 reports a blocked live connection separately', async () => {
    const out = await run(async () => new Response('{}', {status:200}), true)
    expect(out).toMatch(/Live connection is blocked/i)
    expect(out).toMatch(/ad blocker|VPN|antivirus/i)
  })
  it('TC-GP-X-07 says plainly when the settings are missing from the build', async () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    vi.resetModules()
    const {diagnose: d} = await import('../auth.jsx')
    const out = (await d()).map(x => x.t).join(' | ')
    expect(out).toMatch(/settings are missing in this build/i)
    vi.unstubAllEnvs(); vi.resetModules()
  })
})

// ------------------------------------------------------- owner setup, existing account
describe('TC-OS: first-time owner setup (further paths)', () => {
  it('TC-OS-04 uses an account that already exists instead of making a second one', async () => {
    const {createUserWithEmailAndPassword} = await import('firebase/auth')
    createUserWithEmailAndPassword.mockRejectedValueOnce(
      Object.assign(new Error('x'), {code:'auth/email-already-in-use'}))
    renderApp('/admin/setup')
    await screen.findByRole('heading', {name:/Owner setup/i})
    await userEvent.type(screen.getByLabelText(/Admin email/i), 'owner@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.type(screen.getByLabelText(/Setup code/i), 'SM-Q338HG9Q3X6K')
    await userEvent.click(screen.getByRole('button', {name:/Create admin account/i}))
    expect(await screen.findByRole('heading', {name:'Admin'})).toBeInTheDocument()
    const {signInWithEmailAndPassword, deleteUser} = await import('firebase/auth')
    expect(signInWithEmailAndPassword).toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()   // an account we did not create is never removed
  })
})

// ------------------------------------------------------------ the saved machine list
describe('TC-MP: the saved list when storage misbehaves', () => {
  it('TC-MP-11 ignores a saved list that is not readable', async () => {
    localStorage.setItem(CK, 'not json at all')
    renderApp('/machines')
    await waitFor(() => expect(screen.getAllByText(/Plate Grinding CNC Machine/i).length).toBeGreaterThan(0))
  })
  it('TC-MP-12 ignores a saved value that is not a list', async () => {
    localStorage.setItem(CK, JSON.stringify({not:'an array'}))
    renderApp('/machines')
    await waitFor(() => expect(screen.getAllByText(/Plate Grinding CNC Machine/i).length).toBeGreaterThan(0))
  })
  it('TC-MP-13 ignores an empty saved list', async () => {
    localStorage.setItem(CK, '[]')
    renderApp('/machines')
    await waitFor(() => expect(screen.getAllByText(/Plate Grinding CNC Machine/i).length).toBeGreaterThan(0))
  })
  it('TC-MP-14 still shows the machines when the browser refuses to store them', async () => {
    const real = localStorage.setItem
    localStorage.setItem = () => { throw new Error('storage is full') }
    try {
      renderApp('/machines')
      await settle([machineDoc('m1'), machineDoc('m2')])
      expect(await screen.findByText('Cat m1')).toBeInTheDocument()
    } finally { localStorage.setItem = real }
  })
  it('TC-MP-15 still falls back when the browser refuses to clear them', async () => {
    localStorage.setItem(CK, JSON.stringify([{id:'m1', n:'One', c:'One', d:'', s:[], a:[], images:[], video:'', poster:''}]))
    const real = localStorage.removeItem
    localStorage.removeItem = () => { throw new Error('storage is locked') }
    try {
      renderApp('/machines')
      await act(async () => { emitSnapshot('machines', [], {fromCache:false}) })
      await waitFor(() => expect(screen.getAllByText(/Plate Grinding CNC Machine/i).length).toBeGreaterThan(0))
    } finally { localStorage.removeItem = real }
  })
  it('TC-MP-16 a machine with no name at all does not break the list', async () => {
    renderApp('/machines')
    await act(async () => { emitSnapshot('machines', [{id:'blank', data:{}}]) })
    expect(await screen.findByRole('heading', {name:/Explore our machines/i})).toBeInTheDocument()
  })
  it('TC-MP-17 the card title falls back to the full machine name', async () => {
    renderApp('/machines')
    await act(async () => { emitSnapshot('machines', [{id:'x', data:{n:'Only A Long Name'}}]) })
    expect(await screen.findByText('Only A Long Name')).toBeInTheDocument()
  })
})

// --------------------------------------------------------------- the hero video
describe('TC-HB: the moving background on the home page', () => {
  const setWidth = w => Object.defineProperty(window, 'innerWidth', {value:w, configurable:true})

  beforeEach(() => { setWidth(1280); delete navigator.connection })

  it('TC-HB-01 plays the background video on a wide screen', async () => {
    vi.useFakeTimers()
    try {
      const {container} = renderApp('/')
      await act(async () => { vi.advanceTimersByTime(600) })
      expect(container.querySelector('video.herobg')).not.toBeNull()
    } finally { vi.useRealTimers() }
  })
  it('TC-HB-02 leaves the video out on a narrow screen', async () => {
    setWidth(500)
    vi.useFakeTimers()
    try {
      const {container} = renderApp('/')
      await act(async () => { vi.advanceTimersByTime(600) })
      expect(container.querySelector('video.herobg')).toBeNull()
      expect(container.querySelector('img.herobg')).not.toBeNull()   // the still picture is still there
    } finally { vi.useRealTimers() }
  })
  it('TC-HB-03 leaves the video out when the person prefers less movement', async () => {
    window.matchMedia = q => ({matches:true, media:q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}})
    vi.useFakeTimers()
    try {
      const {container} = renderApp('/')
      await act(async () => { vi.advanceTimersByTime(600) })
      expect(container.querySelector('video.herobg')).toBeNull()
    } finally {
      vi.useRealTimers()
      window.matchMedia = q => ({matches:false, media:q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}})
    }
  })
  it('TC-HB-04 leaves the video out when the person is saving data', async () => {
    Object.defineProperty(navigator, 'connection', {value:{saveData:true}, configurable:true})
    vi.useFakeTimers()
    try {
      const {container} = renderApp('/')
      await act(async () => { vi.advanceTimersByTime(600) })
      expect(container.querySelector('video.herobg')).toBeNull()
    } finally { vi.useRealTimers(); delete navigator.connection }
  })
  it('TC-HB-05 waits for the page to finish loading before starting the video', async () => {
    Object.defineProperty(document, 'readyState', {value:'loading', configurable:true})
    vi.useFakeTimers()
    try {
      const {container} = renderApp('/')
      await act(async () => { vi.advanceTimersByTime(600) })
      expect(container.querySelector('video.herobg')).toBeNull()   // nothing yet
      await act(async () => { window.dispatchEvent(new Event('load')); vi.advanceTimersByTime(600) })
      expect(container.querySelector('video.herobg')).not.toBeNull()
    } finally {
      vi.useRealTimers()
      Object.defineProperty(document, 'readyState', {value:'complete', configurable:true})
    }
  })
})

// ------------------------------------------------------------------- uploads
describe('TC-UP: uploads (further paths)', () => {
  it('TC-UP-12 explains an answer from Cloudinary that cannot be read', async () => {
    class BadXHR {
      constructor() { this.upload = {}; BadXHR.last = this }
      open() {} ; send() {}
    }
    window.XMLHttpRequest = BadXHR
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const p = uploadToCloudinary({type:'image/png', size:1000, name:'a.png'})
    BadXHR.last.status = 200
    BadXHR.last.responseText = '<html>gateway error</html>'
    BadXHR.last.onload()
    await expect(p).rejects.toThrow(/Upload failed/)
  })
})

// --------------------------------------------------------------- email checks
describe('TC-EM: email checks (further paths)', () => {
  it('TC-EM-21 refuses a domain that publishes a null MX record', async () => {
    global.fetch = vi.fn(async url => new Response(JSON.stringify(
      String(url).includes('type=MX')
        ? {Status:0, Answer:[{type:15, data:'0 .'}]}   // RFC 7505: this domain accepts no mail
        : {Status:0, Answer:[]})))
    const r = await checkEmail('user@nomail.example')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/does not exist or cannot receive email/i)
  })
  it('TC-EM-22 suggests a correction when a mistyped domain also does not exist', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({Status:3})))
    const r = await checkEmail('user@gmil.com', {allowTypo:true})
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/does not exist/i)
    expect(r.suggestion).toBe('user@gmail.com')
  })
})
