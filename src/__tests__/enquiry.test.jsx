import {describe, it, expect} from 'vitest'
import {screen, act, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'
import {onRest, docFields, queryRows} from '../test/rest.js'

const withProfile = (over = {}) =>
  onRest(u => u.includes('/users/') && {status:200, body:docFields({name:'Shyam Kumar', mobile:'9876543210', email:'user@example.com', ...over})})
const settle = async () => act(async () => { emitSnapshot('machines', [machineDoc('m1')]) })

describe('TC-EQ: sending an enquiry', () => {
  it('TC-EQ-01 the form names the machine being asked about', async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    expect(await screen.findByRole('heading', {name:/Enquiry form/i})).toBeInTheDocument()
    expect(screen.getByText(/Enquiring about Machine m1/i)).toBeInTheDocument()
  })

  it('TC-EQ-02 fills in the name and mobile already saved for this member', async () => {
    withProfile()
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    // the profile arrives from the database after the form is first drawn
    await waitFor(() => expect(screen.getByLabelText('Full name *')).toHaveValue('Shyam Kumar'))
    expect(screen.getByLabelText('Mobile number *')).toHaveValue('9876543210')
    expect(screen.getByLabelText('Email *')).toHaveValue('user@example.com')
  })

  it('TC-EQ-03 does not overwrite what the person has already typed', async () => {
    // hold the profile back until the person has typed a different name
    let release
    const gate = new Promise(r => { release = r })
    onRest(u => u.includes('/users/') && {status:200, after:gate,
      body:docFields({name:'Shyam Kumar', mobile:'9876543210', email:'user@example.com'})})
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    await userEvent.type(screen.getByLabelText('Full name *'), 'Someone Else')
    release()
    await waitFor(() => expect(screen.getByLabelText('Mobile number *')).toHaveValue('9876543210'))
    expect(screen.getByLabelText('Full name *')).toHaveValue('Someone Else')
  })

  it('TC-EQ-04 opens WhatsApp with the enquiry ready to send', async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    await userEvent.type(screen.getByLabelText('Full name *'), 'Shyam')
    await userEvent.type(screen.getByLabelText('Mobile number *'), '9876543210')
    await userEvent.type(screen.getByLabelText('Company name *'), 'True Tracking')
    await userEvent.type(screen.getByLabelText('Requirement / message *'), 'Need a quote')
    await userEvent.click(screen.getByRole('button', {name:/Continue to WhatsApp/i}))
    expect(window.open).toHaveBeenCalled()
    const url = decodeURIComponent(window.open.mock.calls[0][0])
    expect(url).toContain('https://wa.me/919876543210')
    expect(url).toContain('Shyam')
    expect(url).toContain('True Tracking')
    expect(url).toContain('Need a quote')
    expect(url).toContain('Machine m1')
    // WhatsApp must not be handed a way back into this page
    expect(window.open.mock.calls[0][1]).toBe('_blank')
    expect(window.open.mock.calls[0][2]).toBe('noopener')
  })

  it('TC-EQ-05 saves nothing until the person says they sent it', async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    await userEvent.type(screen.getByLabelText('Full name *'), 'Shyam')
    await userEvent.type(screen.getByLabelText('Mobile number *'), '9876543210')
    await userEvent.type(screen.getByLabelText('Company name *'), 'True Tracking')
    await userEvent.type(screen.getByLabelText('Requirement / message *'), 'Need a quote')
    await userEvent.click(screen.getByRole('button', {name:/Continue to WhatsApp/i}))
    expect(await screen.findByRole('heading', {name:/Send on WhatsApp/i})).toBeInTheDocument()
    expect(fb.writes.filter(w => w.collection === 'enquiries')).toHaveLength(0)
  })

  it('TC-EQ-06 records the enquiry once the person confirms', async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    await userEvent.type(screen.getByLabelText('Full name *'), 'Shyam')
    await userEvent.type(screen.getByLabelText('Mobile number *'), '9876543210')
    await userEvent.type(screen.getByLabelText('Company name *'), 'True Tracking')
    await userEvent.type(screen.getByLabelText('Requirement / message *'), 'Need a quote')
    await userEvent.click(screen.getByRole('button', {name:/Continue to WhatsApp/i}))
    await userEvent.click(await screen.findByRole('button', {name:/Yes, I sent it on WhatsApp/i}))
    await waitFor(() => expect(fb.writes.filter(w => w.collection === 'enquiries')).toHaveLength(1))
    const saved = fb.writes.find(w => w.collection === 'enquiries').data
    expect(saved.machineId).toBe('m1')
    expect(saved.company).toBe('True Tracking')
    expect(saved.uid).toBe(fb.currentUser.uid)
  })

  it('TC-EQ-07 the person can go back and change the enquiry', async () => {
    fb.currentUser = makeUser()
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    await userEvent.type(screen.getByLabelText('Full name *'), 'Shyam')
    await userEvent.type(screen.getByLabelText('Mobile number *'), '9876543210')
    await userEvent.type(screen.getByLabelText('Company name *'), 'True Tracking')
    await userEvent.type(screen.getByLabelText('Requirement / message *'), 'Need a quote')
    await userEvent.click(screen.getByRole('button', {name:/Continue to WhatsApp/i}))
    await userEvent.click(await screen.findByRole('button', {name:/Edit my enquiry/i}))
    expect(await screen.findByRole('heading', {name:/Enquiry form/i})).toBeInTheDocument()
    expect(screen.getByLabelText('Company name *')).toHaveValue('True Tracking')
  })

  it('TC-EQ-08 explains it when the enquiry cannot be saved', async () => {
    fb.currentUser = makeUser()
    fb.fail.write = 'permission-denied'
    renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name:/Enquiry form/i})
    await userEvent.type(screen.getByLabelText('Full name *'), 'Shyam')
    await userEvent.type(screen.getByLabelText('Mobile number *'), '9876543210')
    await userEvent.type(screen.getByLabelText('Company name *'), 'True Tracking')
    await userEvent.type(screen.getByLabelText('Requirement / message *'), 'Need a quote')
    await userEvent.click(screen.getByRole('button', {name:/Continue to WhatsApp/i}))
    await userEvent.click(await screen.findByRole('button', {name:/Yes, I sent it on WhatsApp/i}))
    expect(await screen.findByText(/database refused this/i)).toBeInTheDocument()
  })
})

describe('TC-DB: the member dashboard', () => {
  it('TC-DB-01 greets the member and shows their details', async () => {
    withProfile()
    fb.currentUser = makeUser()
    const {container} = renderApp('/dashboard')
    expect(await screen.findByRole('heading', {name:/Hello, Shyam Kumar/i})).toBeInTheDocument()
    // the email and the mobile sit in one block, split by a line break
    await waitFor(() => expect(container.textContent).toContain('9876543210'))
    expect(container.textContent).toContain('user@example.com')
  })

  it('TC-DB-02 lists the enquiries this member sent', async () => {
    onRest(u => u.includes(':runQuery') && {status:200, body:queryRows([
      {machineId:'m1', message:'Need a quote', createdAt:'2026-01-05T10:00:00Z'},
    ])})
    fb.currentUser = makeUser()
    renderApp('/dashboard')
    await settle()
    expect(await screen.findByText('Machine m1')).toBeInTheDocument()
    expect(screen.getByText(/Sent on WhatsApp/i)).toBeInTheDocument()
  })

  it('TC-DB-03 says so when there are no enquiries yet', async () => {
    onRest(u => u.includes(':runQuery') && {status:200, body:[]})
    fb.currentUser = makeUser()
    renderApp('/dashboard')
    expect(await screen.findByText(/No enquiries yet/i)).toBeInTheDocument()
  })

  it('TC-DB-04 names the machine an enquiry was about, not a different one', async () => {
    onRest(u => u.includes(':runQuery') && {status:200, body:queryRows([
      {machineId:'deleted-machine', message:'Old enquiry', createdAt:'2026-01-05T10:00:00Z'},
    ])})
    fb.currentUser = makeUser()
    renderApp('/dashboard')
    await settle()
    expect(await screen.findByText(/not listed any more/i)).toBeInTheDocument()
    expect(screen.queryByText('Machine m1')).not.toBeInTheDocument()
  })
})
