import {describe, it, expect, vi} from 'vitest'
import {screen, act, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'

const settle = async (docs = [machineDoc('m1'), machineDoc('m2')]) =>
  act(async () => { emitSnapshot('machines', docs) })

describe('TC-RT: moving around the website', () => {
  it('TC-RT-01 the home page shows the headline', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', {name: /Powering industry/i})).toBeInTheDocument()
  })
  it('TC-RT-02 the about page opens', async () => {
    renderApp('/about')
    expect(await screen.findByRole('heading', {name: /About SM Automation/i})).toBeInTheDocument()
  })
  it('TC-RT-03 the machines page lists every machine', async () => {
    renderApp('/machines')
    await settle()
    await waitFor(() => expect(screen.getByText('Cat m1')).toBeInTheDocument())
    expect(screen.getByText('Cat m2')).toBeInTheDocument()
  })
  it('TC-RT-04 a machine page shows its name and specifications', async () => {
    renderApp('/machines/m1')
    await settle()
    expect(await screen.findByRole('heading', {name: 'Machine m1'})).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('M1')).toBeInTheDocument()
  })
  it('TC-RT-05 a machine that was removed says so instead of showing another one', async () => {
    renderApp('/machines/deleted-one')
    await settle()
    expect(await screen.findByRole('heading', {name: /Machine not found/i})).toBeInTheDocument()
    expect(screen.queryByRole('heading', {name: 'Machine m1'})).not.toBeInTheDocument()
  })
  it('TC-RT-06 waits for the database before saying a machine is missing', async () => {
    renderApp('/machines/m1')
    expect(screen.getByText(/Loading/)).toBeInTheDocument()   // not yet "not found"
    await settle()
    expect(await screen.findByRole('heading', {name: 'Machine m1'})).toBeInTheDocument()
  })
  it('TC-RT-07 an address that does not exist goes to the home page', async () => {
    renderApp('/nonsense')
    expect(await screen.findByRole('heading', {name: /Powering industry/i})).toBeInTheDocument()
  })
  it('TC-RT-08 the dashboard asks a visitor to log in', async () => {
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', {name: /Welcome back/i})).toBeInTheDocument()
  })
  it('TC-RT-09 enquiring asks a visitor to log in', async () => {
    renderApp('/enquire/m1')
    expect(await screen.findByText(/Log in to send your enquiry/i)).toBeInTheDocument()
  })
  it('TC-RT-10 the admin page asks a visitor to log in', async () => {
    renderApp('/admin')
    expect(await screen.findByRole('heading', {name: /Welcome back/i})).toBeInTheDocument()
  })
  it('TC-RT-11 the menu shows Login to a visitor and Dashboard to a member', async () => {
    const v = renderApp('/')
    expect(await screen.findByRole('link', {name:'Login'})).toBeInTheDocument()
    v.unmount()
    fb.currentUser = makeUser()
    renderApp('/')
    expect(await screen.findByRole('link', {name:'Dashboard'})).toBeInTheDocument()
    expect(screen.queryByRole('link', {name:'Login'})).not.toBeInTheDocument()
  })
  it('TC-RT-12 opening another page scrolls back to the top', async () => {
    renderApp('/')
    await screen.findByRole('heading', {name: /Powering industry/i})
    Element.prototype.scrollTo.mockClear()
    await userEvent.click(screen.getByRole('link', {name:'About'}))
    await screen.findByRole('heading', {name: /About SM Automation/i})
    // on wide screens <main> is what scrolls, not the window
    expect(Element.prototype.scrollTo).toHaveBeenCalled()
  })
  it('TC-RT-13 the menu button opens and closes the menu', async () => {
    renderApp('/')
    const btn = await screen.findByRole('button', {name:/Toggle navigation/i})
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })
  it('TC-RT-14 the menu closes by itself after opening a page', async () => {
    renderApp('/')
    const btn = await screen.findByRole('button', {name:/Toggle navigation/i})
    await userEvent.click(btn)
    await userEvent.click(screen.getByRole('link', {name:'Machines'}))
    await waitFor(() => expect(btn).toHaveAttribute('aria-expanded', 'false'))
  })
})
