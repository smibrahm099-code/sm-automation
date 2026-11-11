import {describe, it, expect, vi} from 'vitest'
import {screen, act, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'
import {onRest, docFields} from '../test/rest.js'
import {withTimeout, retry} from '../auth.jsx'

const settle = async (docs = [machineDoc('m1'), machineDoc('m2')]) =>
  act(async () => { emitSnapshot('machines', docs) })
const asAdmin = () => onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:200, body:{fields:{}}})

describe('TC-GP-E: enquiring about a machine that is gone', () => {
  it('TC-GP-E-01 does not quietly offer a different machine', async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/deleted-machine')
    await settle()
    await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument())
    expect(screen.queryByText(/Enquiring about Machine m1/i)).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', {name:/Machine not found/i})).toBeInTheDocument()
  })

  it('TC-GP-E-02 never records an enquiry against the wrong machine', async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/deleted-machine')
    await settle()
    await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument())
    expect(screen.queryByRole('button', {name:/Continue to WhatsApp/i})).not.toBeInTheDocument()
    expect(fb.writes.filter(w => w.collection === 'enquiries')).toHaveLength(0)
  })
})

describe('TC-GP-V: the verify your email screen', () => {
  const reachVerify = async () => {
    fb.nextUser = {emailVerified:false}
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    await screen.findByRole('heading', {name:/Verify your email/i})
    delete fb.nextUser
  }

  it('TC-GP-V-01 can send the verification email again', async () => {
    await reachVerify()
    const before = fb.emails.length
    await userEvent.click(screen.getByRole('button', {name:/Resend email/i}))
    await waitFor(() => expect(fb.emails.length).toBe(before + 1))
    expect(await screen.findByText(/Verification email sent again/i)).toBeInTheDocument()
  })

  it('TC-GP-V-02 says so when the link has still not been clicked', async () => {
    await reachVerify()
    await userEvent.click(screen.getByRole('button', {name:/I've verified my email/i}))
    expect(await screen.findByText(/Not verified yet/i)).toBeInTheDocument()
  })

  it('TC-GP-V-03 lets the member in once the link has been clicked', async () => {
    await reachVerify()
    fb.currentUser.reload = vi.fn(async () => { fb.currentUser.emailVerified = true })
    await userEvent.click(screen.getByRole('button', {name:/I've verified my email/i}))
    expect(await screen.findByRole('heading', {name:/Hello/i})).toBeInTheDocument()
  })

  it('TC-GP-V-04 can start again with a different address', async () => {
    await reachVerify()
    await userEvent.click(screen.getByRole('button', {name:/Use a different email/i}))
    expect(await screen.findByRole('heading', {name:/Welcome back/i})).toBeInTheDocument()
    expect(fb.currentUser).toBeNull()
  })
})

describe('TC-GP-A: remembering the owner on this device', () => {
  it('TC-GP-A-01 opens the admin page at once while the check is still running', async () => {
    let release
    const gate = new Promise(r => { release = r })
    onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:200, after:gate, body:{fields:{}}})
    fb.currentUser = makeUser({email:'owner@example.com'})
    localStorage.setItem('sm_admin_' + fb.currentUser.uid, '1')
    renderApp('/admin')
    // the slow check has not answered yet, but the owner is already in
    expect(await screen.findByRole('heading', {name:'Admin'})).toBeInTheDocument()
    release()
  })

  it('TC-GP-A-02 forgets the owner when they log out', async () => {
    asAdmin()
    fb.currentUser = makeUser({email:'owner@example.com'})
    const uid = fb.currentUser.uid
    renderApp('/admin')
    await screen.findByRole('heading', {name:'Admin'})
    await waitFor(() => expect(localStorage.getItem('sm_admin_' + uid)).toBe('1'))
    await userEvent.click(screen.getByRole('button', {name:'Log out'}))
    await waitFor(() => expect(localStorage.getItem('sm_admin_' + uid)).toBeNull())
  })
})

describe('TC-GP-G: when the owner check cannot be made', () => {
  it('TC-GP-G-01 calls it a connection problem, not a wrong password', async () => {
    onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:500, body:{error:{message:'boom'}}})
    fb.currentUser = makeUser({email:'owner@example.com'})
    renderApp('/admin')
    expect(await screen.findByText(/Could not confirm your admin access/i, {}, {timeout:8000})).toBeInTheDocument()
    expect(screen.getByText(/connection problem, not a wrong password/i)).toBeInTheDocument()
  }, 15000)

  it('TC-GP-G-02 offers a way to look for the cause', async () => {
    onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:500, body:{error:{message:'boom'}}})
    fb.currentUser = makeUser({email:'owner@example.com'})
    renderApp('/admin')
    await screen.findByText(/Could not confirm your admin access/i, {}, {timeout:8000})
    expect(screen.getByRole('button', {name:/Find the problem/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name:/Try again/i})).toBeInTheDocument()
  }, 15000)
})

describe('TC-GP-D: the dashboard when the quick route fails', () => {
  it('TC-GP-D-01 falls back to the live connection', async () => {
    onRest(u => u.includes(':runQuery') && {status:500, body:{error:{message:'boom'}}})
    fb.currentUser = makeUser()
    fb.stores.enquiries = new Map([['e1', {
      uid: fb.uid, machineId:'m1', message:'From the fallback',
      createdAt:{seconds:1767610800, toDate:() => new Date('2026-01-05T10:00:00Z')}}]])
    renderApp('/dashboard')
    await settle()
    expect(await screen.findByText('Machine m1')).toBeInTheDocument()
  })

  it('TC-GP-D-02 shows an empty list rather than hanging when both routes fail', async () => {
    onRest(u => u.includes(':runQuery') && {status:500, body:{error:{message:'boom'}}})
    const {getDocs} = await import('firebase/firestore')
    getDocs.mockRejectedValueOnce(Object.assign(new Error('x'), {code:'unavailable'}))
    fb.currentUser = makeUser()
    renderApp('/dashboard')
    expect(await screen.findByText(/No enquiries yet/i)).toBeInTheDocument()
  })
})

describe('TC-GP-L: what the owner sees around the page', () => {
  it('TC-GP-L-01 the menu offers only Admin and Log out', async () => {
    asAdmin()
    fb.currentUser = makeUser({email:'owner@example.com'})
    renderApp('/admin')
    await screen.findByRole('heading', {name:'Admin'})
    expect(screen.getByRole('link', {name:'Admin'})).toBeInTheDocument()
    expect(screen.queryByRole('link', {name:'Home'})).not.toBeInTheDocument()
    expect(screen.queryByRole('link', {name:'Dashboard'})).not.toBeInTheDocument()
    expect(screen.queryByRole('link', {name:'Login'})).not.toBeInTheDocument()
  })

  it('TC-GP-L-02 the owner is moved from the member dashboard to the admin page', async () => {
    asAdmin()
    fb.currentUser = makeUser({email:'owner@example.com'})
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', {name:'Admin'})).toBeInTheDocument()
  })
})

describe('TC-GP-H: the helpers the pages lean on', () => {
  it('TC-GP-H-01 withTimeout gives up and says so', async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toMatchObject({code:'app/timeout'})
  })

  it('TC-GP-H-02 withTimeout passes a quick answer straight through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('TC-GP-H-03 retry stops at once when the database refuses', async () => {
    const fn = vi.fn(async () => { throw Object.assign(new Error('no'), {code:'permission-denied'}) })
    await expect(retry(fn, 3)).rejects.toMatchObject({code:'permission-denied'})
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('TC-GP-H-04 retry tries again after a hiccup', async () => {
    let n = 0
    const fn = vi.fn(async () => { if (++n < 2) throw Object.assign(new Error('slow'), {code:'app/timeout'}); return 'done' })
    await expect(retry(fn, 3)).resolves.toBe('done')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('TC-GP-M: machines saved with pieces missing', () => {
  it('TC-GP-M-01 a machine with only a name still opens', async () => {
    renderApp('/machines/bare')
    await act(async () => { emitSnapshot('machines', [{id:'bare', data:{n:'Bare Machine'}}]) })
    expect(await screen.findByRole('heading', {name:'Bare Machine'})).toBeInTheDocument()
  })

  it('TC-GP-M-02 a machine with no photo still shows on the list', async () => {
    renderApp('/machines')
    await act(async () => { emitSnapshot('machines', [{id:'bare', data:{n:'Bare Machine', c:'Bare'}}]) })
    expect(await screen.findByText('Bare')).toBeInTheDocument()
  })
})
