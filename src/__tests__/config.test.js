import {describe, it, expect, vi, afterEach} from 'vitest'
import {optimg, optvid} from '../machines.jsx'
import {posterFromVideo, cloudinaryReady} from '../cloudinary.js'

const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg'
const VID = 'https://res.cloudinary.com/demo/video/upload/v1/a.mp4'

describe('TC-MD: photo and video addresses', () => {
  it('TC-MD-01 asks Cloudinary for a smaller photo', () => {
    expect(optimg(IMG, 600)).toBe('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_600/v1/a.jpg')
  })
  it('TC-MD-02 uses 1200 wide by default', () => {
    expect(optimg(IMG)).toContain('w_1200')
  })
  it('TC-MD-03 leaves a photo kept on the site alone', () => {
    expect(optimg('/images/x.jpg', 600)).toBe('/images/x.jpg')
  })
  it('TC-MD-04 copes with no photo at all', () => {
    expect(optimg('', 600)).toBe('')
    expect(optimg(undefined, 600)).toBe(undefined)
  })
  it('TC-MD-05 does not change an address twice', () => {
    expect(optimg(optimg(IMG, 600), 600)).toBe(optimg(IMG, 600))
  })
  it('TC-MD-06 asks Cloudinary for a smaller video', () => {
    expect(optvid(VID)).toBe('https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1/a.mp4')
  })
  it('TC-MD-07 leaves a video kept on the site alone', () => {
    expect(optvid('/videos/x.mp4')).toBe('/videos/x.mp4')
  })
  it('TC-MD-08 takes a cover picture from a Cloudinary video', () => {
    expect(posterFromVideo(VID)).toBe('https://res.cloudinary.com/demo/video/upload/so_1/v1/a.jpg')
  })
  it('TC-MD-09 has no cover picture for a video kept on the site', () => {
    expect(posterFromVideo('/videos/sma-6-0.mp4')).toBe('')
    expect(posterFromVideo('')).toBe('')
  })
  it('TC-MD-10 knows uploads are set up when both settings are filled', () => {
    expect(cloudinaryReady).toBe(true)
  })
})

describe("TC-WA: the owner's WhatsApp number", () => {
  afterEach(() => vi.unstubAllEnvs())

  it('TC-WA-01 keeps a number that is already just digits', async () => {
    const {waNumber} = await import('../pages.jsx')
    expect(waNumber()).toBe('919876543210')
  })
  it('TC-WA-02 drops the plus, spaces and dashes wa.me cannot take', async () => {
    const {waNumber} = await import('../pages.jsx')
    vi.stubEnv('VITE_OWNER_WA', '+91 90255-79642')
    expect(waNumber()).toBe('919025579642')
  })
  it('TC-WA-03 copes with the setting missing altogether', async () => {
    const {waNumber} = await import('../pages.jsx')
    vi.stubEnv('VITE_OWNER_WA', '')
    expect(waNumber()).toBe('')
  })
})

describe('TC-FB: the website without Firebase settings', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('TC-FB-01 starts Firebase when all four settings are there', async () => {
    vi.resetModules()
    const fb = await import('../firebase.js')
    expect(fb.configured).toBe(true)
    expect(fb.db).not.toBeNull()
    await expect(fb.loadAuth()).resolves.not.toBeNull()
  })
  it('TC-FB-02 skips Firebase when a setting is missing, instead of throwing', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    vi.resetModules()
    const fb = await import('../firebase.js')
    expect(fb.configured).toBe(false)
    expect(fb.db).toBeNull()
    await expect(fb.loadAuth()).resolves.toBeNull()
  })
  it('TC-FB-04 the sign-in code is fetched once and then shared', async () => {
    vi.resetModules()
    const fb = await import('../firebase.js')
    const [a, b] = await Promise.all([fb.loadAuth(), fb.loadAuth()])
    expect(a).toBe(b)   // one fetch, not one per caller
  })
  it('TC-FB-05 remembers whether anybody has signed in on this device', async () => {
    vi.resetModules()
    const fb = await import('../firebase.js')
    fb.setSession(false)
    expect(fb.hasSession()).toBe(false)   // a first-time visitor never fetches the sign-in code
    fb.setSession(true)
    expect(fb.hasSession()).toBe(true)
    fb.setSession(false)
  })
  it('TC-FB-03 needs every one of the four settings', async () => {
    for (const k of ['VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']) {
      vi.stubEnv(k, '')
      vi.resetModules()
      expect((await import('../firebase.js')).configured, k).toBe(false)
      vi.unstubAllEnvs()
    }
  })
})
