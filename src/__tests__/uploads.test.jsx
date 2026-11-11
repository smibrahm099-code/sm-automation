import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {screen, act} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {renderApp, machineDoc} from '../test/helpers.jsx'
import {emitSnapshot, fb, makeUser} from '../test/firebaseMock.js'
import {onRest} from '../test/rest.js'

// uploadToCloudinary posts straight to Cloudinary with XMLHttpRequest, so the request is caught here
class FakeXHR {
  static last = null
  constructor() { this.upload = {}; FakeXHR.last = this }
  open(method, url) { this.method = method; this.url = url }
  send(body) { this.body = body }
  finish(status, payload) { this.status = status; this.responseText = JSON.stringify(payload); this.onload() }
  progress(loaded, total) { this.upload.onprogress({lengthComputable:true, loaded, total}) }
}
const aFile = (type, size, name = 'x') => ({type, size, name})

describe('TC-UP: sending a photo or video to Cloudinary', () => {
  beforeEach(() => { FakeXHR.last = null; window.XMLHttpRequest = FakeXHR })

  it('TC-UP-01 refuses anything that is not a photo or a video', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    await expect(uploadToCloudinary(aFile('application/pdf', 100))).rejects.toThrow(/Only photos and videos/)
  })

  it('TC-UP-02 refuses a photo over 10 MB', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    await expect(uploadToCloudinary(aFile('image/png', 11 * 1024 * 1024))).rejects.toThrow(/over 10 MB/)
  })

  it('TC-UP-03 refuses a video over 100 MB', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    await expect(uploadToCloudinary(aFile('video/mp4', 101 * 1024 * 1024))).rejects.toThrow(/over 100 MB/)
  })

  it('TC-UP-04 accepts a photo of exactly 10 MB', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const p = uploadToCloudinary(aFile('image/png', 10 * 1024 * 1024))
    FakeXHR.last.finish(200, {secure_url:'https://res.cloudinary.com/democloud/image/upload/v1/a.png'})
    await expect(p).resolves.toMatchObject({kind:'image'})
  })

  it('TC-UP-05 sends a photo to the image address with the upload preset', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const p = uploadToCloudinary(aFile('image/png', 1000))
    expect(FakeXHR.last.method).toBe('POST')
    expect(FakeXHR.last.url).toBe('https://api.cloudinary.com/v1_1/democloud/image/upload')
    expect(FakeXHR.last.body.get('upload_preset')).toBe('demopreset')
    FakeXHR.last.finish(200, {secure_url:'https://x/a.png'})
    await p
  })

  it('TC-UP-06 sends a video to the video address', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const p = uploadToCloudinary(aFile('video/mp4', 1000))
    expect(FakeXHR.last.url).toBe('https://api.cloudinary.com/v1_1/democloud/video/upload')
    FakeXHR.last.finish(200, {secure_url:'https://x/a.mp4'})
    await expect(p).resolves.toMatchObject({kind:'video'})
  })

  it('TC-UP-07 reports how far the upload has got', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const seen = []
    const p = uploadToCloudinary(aFile('image/png', 1000), pct => seen.push(pct))
    FakeXHR.last.progress(25, 100)
    FakeXHR.last.progress(100, 100)
    FakeXHR.last.finish(200, {secure_url:'https://x/a.png'})
    await p
    expect(seen).toEqual([25, 100])
  })

  it('TC-UP-08 hands back the address Cloudinary gives', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const p = uploadToCloudinary(aFile('image/png', 1000))
    FakeXHR.last.finish(200, {secure_url:'https://res.cloudinary.com/democloud/image/upload/v9/b.png'})
    await expect(p).resolves.toEqual({url:'https://res.cloudinary.com/democloud/image/upload/v9/b.png', kind:'image'})
  })

  it('TC-UP-09 explains a refusal from Cloudinary', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const p = uploadToCloudinary(aFile('image/png', 1000))
    FakeXHR.last.finish(400, {error:{message:'Upload preset not found'}})
    await expect(p).rejects.toThrow(/Upload preset not found/)
  })

  it('TC-UP-10 explains a network failure', async () => {
    const {uploadToCloudinary} = await import('../cloudinary.js')
    const p = uploadToCloudinary(aFile('image/png', 1000))
    FakeXHR.last.onerror()
    await expect(p).rejects.toThrow(/Network error/)
  })

  it('TC-UP-11 says uploads are not set up when Cloudinary is missing from .env', async () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '')
    vi.resetModules()
    const {uploadToCloudinary, cloudinaryReady} = await import('../cloudinary.js')
    expect(cloudinaryReady).toBe(false)
    await expect(uploadToCloudinary(aFile('image/png', 1000))).rejects.toThrow(/not set up/)
    vi.unstubAllEnvs(); vi.resetModules()
  })
})

const asAdmin = () => onRest((u, o) => o.method === 'GET' && u.includes('/admins/') && {status:200, body:{fields:{}}})
const twoPhotos = machineDoc('m1', {images:['/images/one.jpg', '/images/two.jpg'], specs:[{k:'Model', v:'M1'}]})
const openEditor = async () => {
  asAdmin()
  fb.currentUser = makeUser({email:'owner@example.com'})
  renderApp('/admin')
  await screen.findByRole('heading', {name:'Admin'})
  await act(async () => { emitSnapshot('machines', [twoPhotos]) })
  await userEvent.click(await screen.findByRole('button', {name:'Edit'}))
}

describe('TC-AE: the machine editor', () => {
  beforeEach(() => { window.XMLHttpRequest = FakeXHR; FakeXHR.last = null })

  it('TC-AE-01 a specification row can be added', async () => {
    await openEditor()
    const before = screen.getAllByPlaceholderText(/Name, e.g./i).length
    await userEvent.click(screen.getByRole('button', {name:/Add specification/i}))
    expect(screen.getAllByPlaceholderText(/Name, e.g./i)).toHaveLength(before + 1)
  })

  it('TC-AE-02 a specification row can be removed', async () => {
    await openEditor()
    const before = screen.getAllByPlaceholderText(/Name, e.g./i).length
    await userEvent.click(screen.getAllByRole('button', {name:/Remove row/i})[0])
    // removing the last row leaves none, so query rather than get
    expect(screen.queryAllByPlaceholderText(/Name, e.g./i)).toHaveLength(before - 1)
    expect(screen.getByRole('button', {name:/Add specification/i})).toBeInTheDocument()
  })

  it('TC-AE-03 empty specification rows are not saved', async () => {
    await openEditor()
    await userEvent.click(screen.getByRole('button', {name:/Add specification/i}))
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    const saved = fb.writes.find(w => w.collection === 'machines')
    expect(saved.data.specs).toEqual([{k:'Model', v:'M1'}])
  })

  it('TC-AE-04 a new specification is saved as a name and a value', async () => {
    await openEditor()
    await userEvent.click(screen.getByRole('button', {name:/Add specification/i}))
    const names = screen.getAllByPlaceholderText(/Name, e.g./i)
    const values = screen.getAllByPlaceholderText(/Value, e.g./i)
    await userEvent.type(names[names.length - 1], 'Motor power')
    await userEvent.type(values[values.length - 1], '5 HP')
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    const saved = fb.writes.find(w => w.collection === 'machines')
    expect(saved.data.specs).toContainEqual({k:'Motor power', v:'5 HP'})
  })

  it('TC-AE-05 the first photo is the main one, and another can be promoted', async () => {
    await openEditor()
    expect(screen.getByText('Main photo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', {name:'Main'}))
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    const saved = fb.writes.find(w => w.collection === 'machines')
    expect(saved.data.images[0]).toBe('/images/two.jpg')
  })

  it('TC-AE-06 a photo can be removed', async () => {
    await openEditor()
    await userEvent.click(screen.getAllByRole('button', {name:'Remove'})[0])
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    const saved = fb.writes.find(w => w.collection === 'machines')
    expect(saved.data.images).toEqual(['/images/two.jpg'])
  })

  it('TC-AE-07 saving waits until an upload has finished', async () => {
    await openEditor()
    const input = document.querySelector('input[type="file"][accept="image/*"]')
    await userEvent.upload(input, new File(['x'], 'photo.png', {type:'image/png'}))
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    expect(await screen.findByText(/Wait for the uploads to finish/i)).toBeInTheDocument()
    expect(fb.writes.filter(w => w.collection === 'machines')).toHaveLength(0)
  })

  it('TC-AE-08 an uploaded photo is added to the machine', async () => {
    await openEditor()
    const input = document.querySelector('input[type="file"][accept="image/*"]')
    await userEvent.upload(input, new File(['x'], 'photo.png', {type:'image/png'}))
    await act(async () => { FakeXHR.last.finish(200, {secure_url:'https://res.cloudinary.com/democloud/image/upload/v1/new.png'}) })
    await userEvent.click(screen.getByRole('button', {name:/Save machine/i}))
    const saved = fb.writes.find(w => w.collection === 'machines')
    expect(saved.data.images).toContain('https://res.cloudinary.com/democloud/image/upload/v1/new.png')
  })

  it('TC-AE-09 cancelling goes back to the list without saving', async () => {
    await openEditor()
    await userEvent.click(screen.getByRole('button', {name:'Cancel'}))
    expect(await screen.findByRole('button', {name:/\+ Add machine/i})).toBeInTheDocument()
    expect(fb.writes.filter(w => w.collection === 'machines')).toHaveLength(0)
  })

  // the editor used to crash here: the finished upload wrote into a form that had already been closed
  it('TC-AE-10 cancelling while a photo is still uploading does not break the page', async () => {
    await openEditor()
    const input = document.querySelector('input[type="file"][accept="image/*"]')
    await userEvent.upload(input, new File(['x'], 'photo.png', {type:'image/png'}))
    await userEvent.click(screen.getByRole('button', {name:'Cancel'}))
    await act(async () => { FakeXHR.last.finish(200, {secure_url:'https://res.cloudinary.com/democloud/image/upload/v1/late.png'}) })
    expect(await screen.findByRole('button', {name:/\+ Add machine/i})).toBeInTheDocument()
    expect(screen.queryByRole('button', {name:/Save machine/i})).not.toBeInTheDocument()
  })

  it('TC-AE-11 cancelling while a video is still uploading does not break the page', async () => {
    await openEditor()
    const input = document.querySelector('input[type="file"][accept="video/*"]')
    await userEvent.upload(input, new File(['x'], 'clip.mp4', {type:'video/mp4'}))
    await userEvent.click(screen.getByRole('button', {name:'Cancel'}))
    await act(async () => { FakeXHR.last.finish(200, {secure_url:'https://res.cloudinary.com/democloud/video/upload/v1/late.mp4'}) })
    expect(await screen.findByRole('button', {name:/\+ Add machine/i})).toBeInTheDocument()
    expect(screen.queryByRole('button', {name:/Save machine/i})).not.toBeInTheDocument()
  })
})
