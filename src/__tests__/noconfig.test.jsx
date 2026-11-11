import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {screen} from '@testing-library/react'

// With no Firebase settings the SDK used to throw while the page was still loading and the whole
// site came up blank. These check that the public pages still work and the rest explains itself.
const freshApp = async () => (await import('../test/helpers.jsx')).renderApp

describe('TC-NC: the website with no Firebase settings', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    vi.resetModules()
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('TC-NC-01 the home page still works', async () => {
    const renderApp = await freshApp()
    renderApp('/')
    expect(await screen.findByRole('heading', {name:/Powering industry/i})).toBeInTheDocument()
  })

  it('TC-NC-02 the machines page shows the built-in machine', async () => {
    const renderApp = await freshApp()
    renderApp('/machines')
    expect(await screen.findByRole('heading', {name:/Explore our machines/i})).toBeInTheDocument()
    // the name appears on the card and again on the moving photo strip
    expect(screen.getAllByText(/Plate Grinding CNC Machine/i).length).toBeGreaterThan(0)
  })

  it('TC-NC-03 a machine page still opens', async () => {
    const renderApp = await freshApp()
    renderApp('/machines/sma-6-0')
    expect(await screen.findByRole('heading', {name:/SMA 6.0 Plate Grinding CNC Machine/i})).toBeInTheDocument()
  })

  it('TC-NC-04 the about page still works', async () => {
    const renderApp = await freshApp()
    renderApp('/about')
    expect(await screen.findByRole('heading', {name:/About SM Automation/i})).toBeInTheDocument()
  })

  it('TC-NC-05 logging in says what is missing instead of failing silently', async () => {
    const renderApp = await freshApp()
    renderApp('/login')
    expect(await screen.findByRole('heading', {name:/Logging in is not available yet/i})).toBeInTheDocument()
    expect(screen.getByText(/VITE_FIREBASE_/)).toBeInTheDocument()
  })

  it('TC-NC-06 registering says the same', async () => {
    const renderApp = await freshApp()
    renderApp('/register')
    expect(await screen.findByRole('heading', {name:/Creating an account is not available yet/i})).toBeInTheDocument()
  })

  it('TC-NC-07 the password reset page says the same', async () => {
    const renderApp = await freshApp()
    renderApp('/forgot')
    expect(await screen.findByRole('heading', {name:/Resetting a password is not available yet/i})).toBeInTheDocument()
  })

  it('TC-NC-08 owner setup says the same', async () => {
    const renderApp = await freshApp()
    renderApp('/admin/setup')
    expect(await screen.findByRole('heading', {name:/Owner setup is not available yet/i})).toBeInTheDocument()
  })

  it('TC-NC-09 the pages that need an account send the visitor to the notice', async () => {
    const renderApp = await freshApp()
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', {name:/Logging in is not available yet/i})).toBeInTheDocument()
  })

  it('TC-NC-10 a missing machine is reported at once, without waiting for a database', async () => {
    const renderApp = await freshApp()
    renderApp('/machines/nothing-here')
    expect(await screen.findByRole('heading', {name:/Machine not found/i})).toBeInTheDocument()
  })
})
