import {describe, it, expect, vi} from 'vitest'
import {screen, act, waitFor, fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'
import {onRest} from '../test/rest.js'

const settle = async (docs = [machineDoc('m1')]) => act(async () => { emitSnapshot('machines', docs) })
const asAdmin = () => onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:200, body:{fields:{}}})
const openAdmin = async () => {
  asAdmin()
  fb.currentUser = makeUser({email:'owner@example.com'})
  renderApp('/admin')
  await screen.findByRole('heading', {name:'Admin'})
}

class FakeXHR {
  static last = null
  constructor() { this.upload = {}; FakeXHR.last = this }
  open(method, url) { this.method = method; this.url = url }
  send(body) { this.body = body }
  finish(status, payload) { this.status = status; this.responseText = JSON.stringify(payload); this.onload() }
}

describe('TC-RT: buttons that move you around', () => {
  it('TC-RT-15 Enquire now on a machine page opens the enquiry form', async () => {
    fb.currentUser = makeUser()
    renderApp('/machines/m1')
    await settle()
    await screen.findByRole('heading', {name:'Machine m1'})
    await userEvent.click(screen.getByRole('button', {name:/Enquire now/i}))
    expect(await screen.findByRole('heading', {name:/Enquiry form/i})).toBeInTheDocument()
  })

  it('TC-RT-16 Enquire now sends a visitor to log in first', async () => {
    renderApp('/machines/m1')
    await settle()
    await screen.findByRole('heading', {name:'Machine m1'})
    await userEvent.click(screen.getByRole('button', {name:/Enquire now/i}))
    expect(await screen.findByText(/Log in to send your enquiry/i)).toBeInTheDocument()
  })

  it('TC-RT-17 a machine card tilts under the pointer and settles back', async () => {
    renderApp('/machines')
    await settle()
    const card = await screen.findByText('Cat m1').then(el => el.closest('.card'))
    card.getBoundingClientRect = () => ({left:0, top:0, width:200, height:150, right:200, bottom:150, x:0, y:0})
    fireEvent.pointerMove(card, {clientX:150, clientY:20})
    expect(card.style.transform).toMatch(/rotate/)
    fireEvent.pointerLeave(card)
    expect(card.style.transform).toBe('')
  })
})

describe('TC-EQ: the confirmation step', () => {
  const reachConfirm = async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    await userEvent.type(screen.getByLabelText('Full name *'), 'Shyam')
    await userEvent.type(screen.getByLabelText('Mobile number *'), '9876543210')
    await userEvent.type(screen.getByLabelText('Company name *'), 'True Tracking')
    await userEvent.type(screen.getByLabelText('Requirement / message *'), 'Need a quote')
    await userEvent.click(screen.getByRole('button', {name:/Continue to WhatsApp/i}))
    await screen.findByRole('heading', {name:/Send on WhatsApp/i})
  }

  it('TC-EQ-09 WhatsApp can be opened again from the confirmation step', async () => {
    await reachConfirm()
    const before = window.open.mock.calls.length
    await userEvent.click(screen.getByRole('button', {name:/Open WhatsApp again/i}))
    expect(window.open.mock.calls.length).toBe(before + 1)
    expect(decodeURIComponent(window.open.mock.calls.at(-1)[0])).toContain('Machine m1')
  })
})

describe('TC-FP: forgotten password (further paths)', () => {
  it('TC-FP-04 the reset email can be sent again once the wait is over', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true})
    try {
      const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime})
      renderApp('/forgot')
      await screen.findByRole('heading', {name:/Forgot password/i})
      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', {name:/Send reset link/i}))
      await screen.findByRole('heading', {name:/Check your email/i})
      // the countdown schedules the next second only after React re-renders, so step through it
      for (let i = 0; i < 31; i++) await act(async () => { vi.advanceTimersByTime(1000) })
      const again = await screen.findByRole('button', {name:/Send the email again/i})
      expect(again).not.toBeDisabled()
      const before = fb.emails.length
      await user.click(again)
      await waitFor(() => expect(fb.emails.length).toBe(before + 1))
    } finally { vi.useRealTimers() }
  })
})

describe('TC-AD: the owner area (further paths)', () => {
  it('TC-AD-12 the owner deletes an enquiry after confirming', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(screen.getByRole('button', {name:'Enquiries'}))
    await act(async () => {
      emitSnapshot('enquiries', [{id:'e1', data:{machineId:'m1', name:'Shyam', mobile:'9', email:'u@e.com', company:'TT', message:'Need a quote', createdAt:null}}])
    })
    await screen.findByText(/Shyam/)
    await userEvent.click(screen.getByRole('button', {name:'Delete'}))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(fb.writes.filter(w => w.op === 'delete' && w.collection === 'enquiries')).toHaveLength(1))
  })

  it('TC-AD-13 saying no leaves the enquiry in place', async () => {
    window.confirm.mockReturnValue(false)
    await openAdmin()
    await settle()
    await userEvent.click(screen.getByRole('button', {name:'Enquiries'}))
    await act(async () => {
      emitSnapshot('enquiries', [{id:'e1', data:{machineId:'m1', name:'Shyam', mobile:'9', email:'u@e.com', company:'TT', message:'Need a quote', createdAt:null}}])
    })
    await screen.findByText(/Shyam/)
    await userEvent.click(screen.getByRole('button', {name:'Delete'}))
    expect(fb.writes.filter(w => w.op === 'delete')).toHaveLength(0)
  })

  it('TC-AD-14 the owner can switch back to the machines tab', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(screen.getByRole('button', {name:'Enquiries'}))
    await userEvent.click(screen.getByRole('button', {name:'Machines'}))
    expect(await screen.findByRole('button', {name:/\+ Add machine/i})).toBeInTheDocument()
  })
})

describe('TC-GP-G: the admin access page (further paths)', () => {
  const failingThenOk = () => {
    let calls = 0
    onRest((u, o) => o.method === 'GET' && u.includes('/admins/') &&
      (++calls <= 2 ? {status:500, body:{error:{message:'boom'}}} : {status:200, body:{fields:{}}}))
  }

  it('TC-GP-G-03 Try again lets the owner in once the connection returns', async () => {
    failingThenOk()
    fb.currentUser = makeUser({email:'owner@example.com'})
    renderApp('/admin')
    await screen.findByText(/Could not confirm your admin access/i, {}, {timeout:8000})
    await userEvent.click(screen.getByRole('button', {name:/Try again/i}))
    expect(await screen.findByRole('heading', {name:'Admin'}, {timeout:8000})).toBeInTheDocument()
  }, 20000)

  it('TC-GP-G-04 a member can leave for their own dashboard', async () => {
    fb.currentUser = makeUser()
    renderApp('/admin')
    await screen.findByRole('heading', {name:/Admin access/i})
    await userEvent.click(screen.getByRole('button', {name:/Go to my dashboard/i}))
    expect(await screen.findByRole('heading', {name:/Hello/i})).toBeInTheDocument()
  })

  it('TC-GP-G-05 a member can log out and use another account', async () => {
    fb.currentUser = makeUser()
    renderApp('/admin')
    await screen.findByRole('heading', {name:/Admin access/i})
    await userEvent.click(screen.getByText(/Log out and use another account/i))
    expect(await screen.findByRole('heading', {name:/Welcome back/i})).toBeInTheDocument()
    expect(fb.currentUser).toBeNull()
  })
})

describe('TC-AE: the machine editor (further paths)', () => {
  const openEditor = async (over = {}) => {
    window.XMLHttpRequest = FakeXHR
    FakeXHR.last = null
    await openAdmin()
    await act(async () => { emitSnapshot('machines', [machineDoc('m1', over)]) })
    await userEvent.click(await screen.findByRole('button', {name:'Edit'}))
  }

  it('TC-AE-10 the short card title can be changed', async () => {
    await openEditor()
    const title = screen.getByLabelText(/Short title shown on cards/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Plate Grinder')
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    await waitFor(() => expect(fb.writes.find(w => w.collection === 'machines')).toBeTruthy())
    expect(fb.writes.find(w => w.collection === 'machines').data.c).toBe('Plate Grinder')
  })

  it('TC-AE-11 an existing video can be removed', async () => {
    await openEditor({video:'https://res.cloudinary.com/democloud/video/upload/v1/a.mp4',
                      poster:'https://res.cloudinary.com/democloud/video/upload/so_1/v1/a.jpg'})
    await userEvent.click(screen.getByRole('button', {name:/Remove video/i}))
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    await waitFor(() => expect(fb.writes.find(w => w.collection === 'machines')).toBeTruthy())
    const saved = fb.writes.find(w => w.collection === 'machines').data
    expect(saved.video).toBe('')
    expect(saved.poster).toBe('')
  })

  it('TC-AE-12 a video can be uploaded and its cover picture is worked out', async () => {
    await openEditor()
    const input = document.querySelector('input[type="file"][accept="video/*"]')
    await userEvent.upload(input, new File(['x'], 'clip.mp4', {type:'video/mp4'}))
    await act(async () => {
      FakeXHR.last.finish(200, {secure_url:'https://res.cloudinary.com/democloud/video/upload/v1/clip.mp4'})
    })
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    await waitFor(() => expect(fb.writes.find(w => w.collection === 'machines')).toBeTruthy())
    const saved = fb.writes.find(w => w.collection === 'machines').data
    expect(saved.video).toBe('https://res.cloudinary.com/democloud/video/upload/v1/clip.mp4')
    expect(saved.poster).toBe('https://res.cloudinary.com/democloud/video/upload/so_1/v1/clip.jpg')
  })

  it('TC-AE-13 an upload that fails is reported next to the file', async () => {
    await openEditor()
    const input = document.querySelector('input[type="file"][accept="image/*"]')
    await userEvent.upload(input, new File(['x'], 'photo.png', {type:'image/png'}))
    await act(async () => { FakeXHR.last.finish(400, {error:{message:'Upload preset not found'}}) })
    expect(await screen.findByText(/Upload preset not found/i)).toBeInTheDocument()
  })
})
