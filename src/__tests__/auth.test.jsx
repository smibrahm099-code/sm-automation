import {describe, it, expect} from 'vitest'
import {screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp} from '../test/helpers.jsx'
import {onRest, posted, rest} from '../test/rest.js'
import {fb, makeUser} from '../test/firebaseMock.js'

const fill = async labels => {
  for (const [label, value] of Object.entries(labels)) {
    await userEvent.clear(screen.getByLabelText(label))
    await userEvent.type(screen.getByLabelText(label), value)
  }
}
const asAdmin = () => onRest(u => u.includes('/admins/') && {status:200, body:{name:'admins/uid-1', fields:{}}})

describe('TC-AU: logging in and registering', () => {
  it('TC-AU-01 the login page shows the form', async () => {
    renderApp('/login')
    expect(await screen.findByRole('heading', {name:/Welcome back/i})).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('TC-AU-02 a member logs in and lands on the dashboard', async () => {
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    await fill({Email:'user@example.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    expect(await screen.findByRole('heading', {name:/Hello/i})).toBeInTheDocument()
  })

  it('TC-AU-03 a wrong password is explained in plain words', async () => {
    fb.fail.signIn = 'auth/invalid-credential'
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    await fill({Email:'user@example.com', Password:'wrongpass'})
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
  })

  it('TC-AU-04 the owner goes straight to the admin page', async () => {
    asAdmin()
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    await fill({Email:'owner@example.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    expect(await screen.findByRole('heading', {name:'Admin'})).toBeInTheDocument()
  })

  it('TC-AU-05 a member who has not verified their email is asked to', async () => {
    fb.nextUser = {emailVerified:false}
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    await fill({Email:'new@example.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    expect(await screen.findByRole('heading', {name:/Verify your email/i})).toBeInTheDocument()
    delete fb.nextUser
  })

  it('TC-AU-06 registering asks for the verification link and saves the profile', async () => {
    renderApp('/register')
    await screen.findByRole('heading', {name:/Create account/i})
    await fill({'Full name':'Shyam', 'Mobile number':'9876543210', Email:'abcdef@gmail.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Register'}))
    expect(await screen.findByRole('heading', {name:/Verify your email/i})).toBeInTheDocument()
    expect(fb.emails.some(e => e.kind === 'verify')).toBe(true)
    await waitFor(() => expect(posted('users').length).toBe(1))
  })

  it('TC-AU-07 a throwaway address is refused and no account is made', async () => {
    renderApp('/register')
    await screen.findByRole('heading', {name:/Create account/i})
    await fill({'Full name':'Shyam', 'Mobile number':'9876543210', Email:'me@mailinator.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Register'}))
    expect(await screen.findByText(/Temporary email addresses are not allowed/i)).toBeInTheDocument()
    expect(fb.currentUser).toBeNull()
  })

  it('TC-AU-08 a mistyped address offers the correction, and the button fixes it', async () => {
    renderApp('/register')
    await screen.findByRole('heading', {name:/Create account/i})
    await fill({'Full name':'Shyam', 'Mobile number':'9876543210', Email:'user@gmil.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Register'}))
    await userEvent.click(await screen.findByRole('button', {name:'Use user@gmail.com'}))
    expect(screen.getByLabelText('Email')).toHaveValue('user@gmail.com')
  })

  it('TC-AU-09 the person can insist their unusual address is right', async () => {
    renderApp('/register')
    await screen.findByRole('heading', {name:/Create account/i})
    await fill({'Full name':'Shyam', 'Mobile number':'9876543210', Email:'user@gmil.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Register'}))
    await userEvent.click(await screen.findByRole('button', {name:/My email is correct/i}))
    await userEvent.click(screen.getByRole('button', {name:'Register'}))
    expect(await screen.findByRole('heading', {name:/Verify your email/i})).toBeInTheDocument()
  })

  it('TC-AU-10 an address already registered is explained', async () => {
    fb.fail.create = 'auth/email-already-in-use'
    renderApp('/register')
    await screen.findByRole('heading', {name:/Create account/i})
    await fill({'Full name':'Shyam', 'Mobile number':'9876543210', Email:'abcdef@gmail.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Register'}))
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
  })

  it('TC-AU-11 the password can be shown and hidden', async () => {
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    const pw = screen.getByLabelText('Password')
    expect(pw).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', {name:/Show password/i}))
    expect(pw).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', {name:/Hide password/i}))
    expect(pw).toHaveAttribute('type', 'password')
  })

  it('TC-AU-12 someone already logged in is sent away from the login page', async () => {
    fb.currentUser = makeUser()
    renderApp('/login')
    expect(await screen.findByRole('heading', {name:/Hello/i})).toBeInTheDocument()
  })

  it('TC-AU-13 logging out returns the visitor to the public site', async () => {
    fb.currentUser = makeUser()
    renderApp('/dashboard')
    await screen.findByRole('heading', {name:/Hello/i})
    await userEvent.click(screen.getByRole('button', {name:'Log out'}))
    expect(await screen.findByRole('heading', {name:/Powering industry/i})).toBeInTheDocument()
  })

  // the sign-in code is fetched on demand, so several things can ask for it at once; whatever the order,
  // only one listener may ever be attached, or every sign-in and sign-out would be handled twice
  it('TC-AU-14 only one auth listener is ever attached, through a whole sign in and out', async () => {
    fb.currentUser = makeUser()
    renderApp('/dashboard')
    await screen.findByRole('heading', {name:/Hello/i})
    expect(fb.authListeners).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', {name:'Log out'}))
    await screen.findByRole('heading', {name:/Powering industry/i})
    expect(fb.authListeners).toHaveLength(1)
    await userEvent.click(screen.getByRole('link', {name:'Login'}))
    await fill({Email:'user@example.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    await screen.findByRole('heading', {name:/Hello/i})
    expect(fb.authListeners).toHaveLength(1)
  })

  // /admin/setup never writes a profile document, so asking for the owner's answers 404 after a
  // round trip wasted on every first login. The profile now waits until the admin check has answered.
  it('TC-AU-15 the owner is never asked for a profile they cannot have', async () => {
    asAdmin()
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    await fill({Email:'owner@example.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    await screen.findByRole('heading', {name:'Admin'})
    expect(rest.calls.filter(c => c.method === 'GET' && c.url.includes('/users/'))).toEqual([])
  })

  it('TC-AU-16 a member is still asked for their profile, and it shows', async () => {
    onRest(u => u.includes('/users/') && {status:200, body:{fields:{name:{stringValue:'Shyam Kumar'}, mobile:{stringValue:'9876543210'}, email:{stringValue:'user@example.com'}}}})
    renderApp('/login')
    await screen.findByRole('heading', {name:/Welcome back/i})
    await fill({Email:'user@example.com', Password:'secret123'})
    await userEvent.click(screen.getByRole('button', {name:'Log in'}))
    expect(await screen.findByRole('heading', {name:/Hello, Shyam Kumar/i})).toBeInTheDocument()
  })
})

describe('TC-FP: forgotten password', () => {
  it('TC-FP-01 sends the reset link and confirms it', async () => {
    renderApp('/forgot')
    await screen.findByRole('heading', {name:/Forgot password/i})
    await fill({Email:'user@example.com'})
    await userEvent.click(screen.getByRole('button', {name:/Send reset link/i}))
    expect(await screen.findByRole('heading', {name:/Check your email/i})).toBeInTheDocument()
    expect(fb.emails.some(e => e.kind === 'reset' && e.to === 'user@example.com')).toBe(true)
  })

  it('TC-FP-02 stops the person sending it again straight away', async () => {
    renderApp('/forgot')
    await screen.findByRole('heading', {name:/Forgot password/i})
    await fill({Email:'user@example.com'})
    await userEvent.click(screen.getByRole('button', {name:/Send reset link/i}))
    expect(await screen.findByRole('button', {name:/Send again in/i})).toBeDisabled()
  })

  it('TC-FP-03 still works when the site address is not yet allowed in Firebase', async () => {
    const {sendPasswordResetEmail} = await import('firebase/auth')
    sendPasswordResetEmail.mockImplementationOnce(async () => {
      throw Object.assign(new Error('x'), {code:'auth/unauthorized-continue-uri'})
    })
    renderApp('/forgot')
    await screen.findByRole('heading', {name:/Forgot password/i})
    await fill({Email:'user@example.com'})
    await userEvent.click(screen.getByRole('button', {name:/Send reset link/i}))
    expect(await screen.findByRole('heading', {name:/Check your email/i})).toBeInTheDocument()
  })
})
