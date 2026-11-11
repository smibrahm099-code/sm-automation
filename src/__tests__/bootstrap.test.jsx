// main.jsx is the file the browser loads first. It was the only source file the suite never ran.
import {describe, it, expect, vi, afterEach} from 'vitest'

afterEach(() => { vi.resetModules(); document.body.innerHTML = '' })

describe('TC-BOOT: starting the website', () => {
  it('TC-BOOT-01 mounts the website into the page', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    await import('../main.jsx')
    // the header and the home page headline are drawn, so routing and both providers are wired up
    await vi.waitFor(() => expect(root.querySelector('header')).not.toBeNull())
    expect(root.textContent).toMatch(/SM AUTOMATION/i)
    expect(root.querySelector('main')).not.toBeNull()
  })

  it('TC-BOOT-02 draws the home page at the opening address', async () => {
    window.history.pushState({}, '', '/')
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    await import('../main.jsx')
    await vi.waitFor(() => expect(root.textContent).toMatch(/Powering industry/i))
  })
})
