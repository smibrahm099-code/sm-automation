// Accessibility checks with axe. These run over the real pages, so a label that is not linked to
// its field, an image with no description or a heading out of order is caught automatically
// rather than by luck.
//
// jsdom has no layout engine, so axe cannot judge colour contrast here; those rules are reported
// as "incomplete" and are checked by eye in a real browser instead.
import {describe, it, expect, beforeAll, vi} from 'vitest'
import {screen, act, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {axe, toHaveNoViolations} from 'jest-axe'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'
import {onRest, docFields} from '../test/rest.js'

// axe is slow in jsdom, and a scan cut short by a timeout leaves it running and breaks every
// later test, so give it room
vi.setConfig({testTimeout: 60000, hookTimeout: 60000})
beforeAll(() => { expect.extend(toHaveNoViolations) })

const settle = async (docs = [machineDoc('m1'), machineDoc('m2')]) =>
  act(async () => { emitSnapshot('machines', docs) })
const asAdmin = () => onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:200, body:{fields:{}}})

// colour contrast needs real layout, which jsdom does not have.
// resultTypes keeps axe from working out the detail of everything that passed, which is most of the time.
const check = async container => axe(container, {
  resultTypes: ['violations'],
  rules: {'color-contrast': {enabled: false}},
})

describe('TC-A11Y: the pages anyone can reach', () => {
  it('TC-A11Y-01 the home page has no accessibility violations', async () => {
    const {container} = renderApp('/')
    await screen.findByRole('heading', {name: /Powering industry/i})
    await settle()
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-02 the about page has no accessibility violations', async () => {
    const {container} = renderApp('/about')
    await screen.findByRole('heading', {name: /About SM Automation/i})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-03 the machines page has no accessibility violations', async () => {
    const {container} = renderApp('/machines')
    await settle()
    await screen.findByText('Cat m1')
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-04 a machine page has no accessibility violations', async () => {
    const {container} = renderApp('/machines/m1')
    await settle()
    await screen.findByRole('heading', {name: 'Machine m1'})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-05 the machine not found page has no accessibility violations', async () => {
    const {container} = renderApp('/machines/gone')
    await settle()
    await screen.findByRole('heading', {name: /Machine not found/i})
    expect(await check(container)).toHaveNoViolations()
  })
})

describe('TC-A11Y: the forms', () => {
  it('TC-A11Y-06 the login form has no accessibility violations', async () => {
    const {container} = renderApp('/login')
    await screen.findByRole('heading', {name: /Welcome back/i})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-07 the registration form has no accessibility violations', async () => {
    const {container} = renderApp('/register')
    await screen.findByRole('heading', {name: /Create account/i})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-08 the forgotten password form has no accessibility violations', async () => {
    const {container} = renderApp('/forgot')
    await screen.findByRole('heading', {name: /Forgot password/i})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-09 the owner setup form has no accessibility violations', async () => {
    const {container} = renderApp('/admin/setup')
    await screen.findByRole('heading', {name: /Owner setup/i})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-10 the enquiry form has no accessibility violations', async () => {
    onRest(u => u.includes('/users/') && {status:200, body:docFields({name:'Shyam', mobile:'9876543210', email:'u@e.com'})})
    fb.currentUser = makeUser()
    const {container} = renderApp('/enquire/m1')
    await settle()
    await screen.findByRole('heading', {name: /Enquiry form/i})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-11 the verify your email screen has no accessibility violations', async () => {
    fb.nextUser = {emailVerified: false}
    const {container} = renderApp('/login')
    await screen.findByRole('heading', {name: /Welcome back/i})
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', {name: 'Log in'}))
    await screen.findByRole('heading', {name: /Verify your email/i})
    delete fb.nextUser
    expect(await check(container)).toHaveNoViolations()
  })
})

describe('TC-A11Y: the pages behind a login', () => {
  it('TC-A11Y-12 the member dashboard has no accessibility violations', async () => {
    onRest(u => u.includes(':runQuery') && {status:200, body:[]})
    fb.currentUser = makeUser()
    const {container} = renderApp('/dashboard')
    await screen.findByRole('heading', {name: /Hello/i})
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-13 the admin machines tab has no accessibility violations', async () => {
    asAdmin()
    fb.currentUser = makeUser({email: 'owner@example.com'})
    const {container} = renderApp('/admin')
    await screen.findByRole('heading', {name: 'Admin'})
    await settle()
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-14 the machine editor has no accessibility violations', async () => {
    asAdmin()
    fb.currentUser = makeUser({email: 'owner@example.com'})
    const {container} = renderApp('/admin')
    await screen.findByRole('heading', {name: 'Admin'})
    await settle([machineDoc('m1', {video: 'https://res.cloudinary.com/democloud/video/upload/v1/a.mp4'})])
    await userEvent.click(await screen.findByRole('button', {name: 'Edit'}))
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-15 the admin enquiries tab has no accessibility violations', async () => {
    asAdmin()
    fb.currentUser = makeUser({email: 'owner@example.com'})
    const {container} = renderApp('/admin')
    await screen.findByRole('heading', {name: 'Admin'})
    await settle()
    await userEvent.click(screen.getByRole('button', {name: 'Enquiries'}))
    await act(async () => {
      emitSnapshot('enquiries', [{id: 'e1', data: {machineId: 'm1', name: 'Shyam', mobile: '9',
        email: 'u@e.com', company: 'TT', message: 'Need a quote', createdAt: null}}])
    })
    await screen.findByText(/Shyam/)
    expect(await check(container)).toHaveNoViolations()
  })

  it('TC-A11Y-16 the admin access page has no accessibility violations', async () => {
    fb.currentUser = makeUser()
    const {container} = renderApp('/admin')
    await screen.findByRole('heading', {name: /Admin access/i})
    expect(await check(container)).toHaveNoViolations()
  })
})

describe('TC-A11Y: navigation', () => {
  it('TC-A11Y-17 the open mobile menu has no accessibility violations', async () => {
    const {container} = renderApp('/')
    const btn = await screen.findByRole('button', {name: /Toggle navigation/i})
    await userEvent.click(btn)
    await waitFor(() => expect(btn).toHaveAttribute('aria-expanded', 'true'))
    expect(await check(container)).toHaveNoViolations()
  })

  // The three below were found by running axe in a real browser, where there is layout to measure.
  // They are pinned here so they cannot come back.
  it('TC-A11Y-19 every page has exactly one top-level heading of its own', async () => {
    const pages = ['/', '/about', '/machines', '/machines/m1', '/machines/gone', '/login',
                   '/register', '/forgot', '/admin/setup']
    for (const path of pages) {
      const {container, unmount} = renderApp(path)
      await settle()
      await waitFor(() => expect(container.querySelector('h1')).not.toBeNull())
      expect(container.querySelectorAll('h1'), path).toHaveLength(1)
      unmount()
    }
  })

  it('TC-A11Y-20 the photo strip can be reached with the keyboard', async () => {
    const {container} = renderApp('/machines/m1')
    await settle()
    await screen.findByRole('heading', {name: 'Machine m1'})
    const media = container.querySelector('.media')
    // it scrolls sideways on a phone, so a keyboard user needs to be able to focus it
    expect(media).toHaveAttribute('tabindex', '0')
    expect(media).toHaveAttribute('aria-label')
  })

  it('TC-A11Y-21 links inside a sentence are underlined, not colour alone', async () => {
    const {container} = renderApp('/login')
    await screen.findByRole('heading', {name: /Welcome back/i})
    const link = container.querySelector('p a[href="/register"]')
    expect(link).not.toBeNull()
    expect(link.style.textDecoration).toBe('underline')
  })

  it('TC-A11Y-18 every page offers a main landmark and a single top heading', async () => {
    const {container} = renderApp('/machines')
    await settle()
    await screen.findByText('Cat m1')
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(await axe(container, {rules: {'color-contrast': {enabled: false},
      'page-has-heading-one': {enabled: true}, 'landmark-one-main': {enabled: true},
      'region': {enabled: true}}})).toHaveNoViolations()
  })
})
