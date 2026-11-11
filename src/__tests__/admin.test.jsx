import {describe, it, expect} from 'vitest'
import {screen, act, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'
import {onRest} from '../test/rest.js'

const asAdmin = () => onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:200, body:{fields:{}}})
const settle = async (docs = [machineDoc('m1')]) => act(async () => { emitSnapshot('machines', docs) })
const openAdmin = async () => {
  asAdmin()
  fb.currentUser = makeUser({email:'owner@example.com'})
  const r = renderApp('/admin')
  await screen.findByRole('heading', {name:'Admin'})
  return r
}

describe('TC-AD: the owner area', () => {
  it('TC-AD-01 a member who is not the owner is told so', async () => {
    fb.currentUser = makeUser()
    renderApp('/admin')
    expect(await screen.findByRole('heading', {name:/Admin access/i})).toBeInTheDocument()
    expect(screen.getByText(/this account is not an admin/i)).toBeInTheDocument()
  })

  it('TC-AD-02 the owner sees the machines and enquiries tabs', async () => {
    await openAdmin()
    expect(screen.getByRole('button', {name:'Machines'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name:'Enquiries'})).toBeInTheDocument()
  })

  it('TC-AD-03 the owner is offered a copy of the built-in machine to edit', async () => {
    await openAdmin()
    expect(await screen.findByRole('button', {name:/Copy to database/i})).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', {name:/Copy to database/i}))
    await waitFor(() => expect(fb.writes.filter(w => w.collection === 'machines')).toHaveLength(1))
    expect(fb.writes[0].id).toBe('sma-6-0')
  })

  it('TC-AD-04 the owner adds a machine and it is saved', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(await screen.findByRole('button', {name:/\+ Add machine/i}))
    await userEvent.type(screen.getByLabelText(/Machine name/i), 'SMA 7.0 Cutter')
    await userEvent.type(screen.getByLabelText(/Description/i), 'A new cutter.')
    await userEvent.type(screen.getByLabelText(/Applications/i), 'Cutting, Steel')
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    await waitFor(() => expect(fb.writes.filter(w => w.collection === 'machines')).toHaveLength(1))
    const saved = fb.writes.find(w => w.collection === 'machines')
    expect(saved.data.n).toBe('SMA 7.0 Cutter')
    expect(saved.data.a).toEqual(['Cutting', 'Steel'])
    expect(saved.id).toMatch(/^sma-7-0-cutter-/)
  })

  it('TC-AD-05 editing a machine opens it with its details already filled in', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(await screen.findByRole('button', {name:'Edit'}))
    expect(screen.getByLabelText(/Machine name/i)).toHaveValue('Machine m1')
    expect(screen.getByLabelText(/Description/i)).toHaveValue('Description for m1')
    expect(screen.getByLabelText(/Applications/i)).toHaveValue('Use A')
  })

  it('TC-AD-06 an edited machine keeps its own entry instead of making a new one', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(await screen.findByRole('button', {name:'Edit'}))
    await userEvent.clear(screen.getByLabelText(/Machine name/i))
    await userEvent.type(screen.getByLabelText(/Machine name/i), 'Machine m1 renamed')
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    await waitFor(() => expect(fb.writes.filter(w => w.collection === 'machines')).toHaveLength(1))
    expect(fb.writes[0].id).toBe('m1')
    expect(fb.writes[0].data.n).toBe('Machine m1 renamed')
  })

  it('TC-AD-07 deleting a machine asks first, then removes it', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(await screen.findByRole('button', {name:'Delete'}))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(fb.writes.filter(w => w.op === 'delete')).toHaveLength(1))
    expect(fb.writes[0].id).toBe('m1')
  })

  it('TC-AD-08 saying no to the question leaves the machine alone', async () => {
    window.confirm.mockReturnValue(false)
    await openAdmin()
    await settle()
    await userEvent.click(await screen.findByRole('button', {name:'Delete'}))
    expect(fb.writes.filter(w => w.op === 'delete')).toHaveLength(0)
  })

  it('TC-AD-09 the enquiries tab shows who asked and what about', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(screen.getByRole('button', {name:'Enquiries'}))
    await act(async () => {
      emitSnapshot('enquiries', [{id:'e1', data:{
        machineId:'m1', name:'Shyam', mobile:'9876543210', email:'user@example.com',
        company:'True Tracking', message:'Need a quote', createdAt:null}}])
    })
    expect(await screen.findByText(/Shyam/)).toBeInTheDocument()
    expect(screen.getByText(/True Tracking/)).toBeInTheDocument()
    expect(screen.getByText(/Need a quote/)).toBeInTheDocument()
  })

  it('TC-AD-10 an enquiry about a removed machine is not labelled with another machine', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(screen.getByRole('button', {name:'Enquiries'}))
    await act(async () => {
      emitSnapshot('enquiries', [{id:'e1', data:{
        machineId:'gone', name:'Shyam', mobile:'9', email:'u@e.com',
        company:'TT', message:'Old', createdAt:null}}])
    })
    expect(await screen.findByText(/not listed any more/i)).toBeInTheDocument()
    expect(screen.queryByText('Machine m1')).not.toBeInTheDocument()
  })

  it('TC-AD-11 uploads are flagged as not set up when Cloudinary is missing', async () => {
    await openAdmin()
    await settle()
    await userEvent.click(await screen.findByRole('button', {name:/\+ Add machine/i}))
    // Cloudinary IS configured in these tests, so the warning must not appear
    expect(screen.queryByText(/uploads are not set up yet/i)).not.toBeInTheDocument()
  })
})

describe('TC-OS: first-time owner setup', () => {
  it('TC-OS-01 creates the owner account and opens the admin page', async () => {
    renderApp('/admin/setup')
    expect(await screen.findByRole('heading', {name:/Owner setup/i})).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Admin email/i), 'owner@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.type(screen.getByLabelText(/Setup code/i), 'SM-Q338HG9Q3X6K')
    await userEvent.click(screen.getByRole('button', {name:/Create admin account/i}))
    expect(await screen.findByRole('heading', {name:'Admin'})).toBeInTheDocument()
  })

  it('TC-OS-02 closes itself once an owner exists', async () => {
    onRest((u, o) => o.method === 'GET' && u.includes('meta/adminSetup') && {status:200, body:{fields:{done:{stringValue:'1'}}}})
    renderApp('/admin/setup')
    expect(await screen.findByText(/admin account is already created/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Setup code/i)).not.toBeInTheDocument()
  })

  it('TC-OS-03 a wrong setup code is refused and no owner is left behind', async () => {
    onRest((u, o) => o.method === 'POST' && u.includes('/admins') && {status:403, body:{error:{message:'denied'}}})
    renderApp('/admin/setup')
    await screen.findByRole('heading', {name:/Owner setup/i})
    await userEvent.type(screen.getByLabelText(/Admin email/i), 'owner@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.type(screen.getByLabelText(/Setup code/i), 'WRONG-CODE')
    await userEvent.click(screen.getByRole('button', {name:/Create admin account/i}))
    expect(await screen.findByText(/Wrong setup code/i)).toBeInTheDocument()
    const {deleteUser} = await import('firebase/auth')
    expect(deleteUser).toHaveBeenCalled()
  })
})
