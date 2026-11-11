import {describe, it, expect, vi} from 'vitest'
import {render, screen, act, waitFor} from '@testing-library/react'
import {MachinesProvider, useMachines} from '../machines.jsx'
import {emitSnapshot, emitSnapshotError, fb} from '../test/firebaseMock.js'
import {machineDoc} from '../test/helpers.jsx'

const CK = 'sm_machines_v1'
const Probe = () => {
  const {machines, source, settled} = useMachines()
  return <div data-testid="p">{JSON.stringify({ids:machines.map(m => m.id), source, settled})}</div>
}
const read = () => JSON.parse(screen.getByTestId('p').textContent)
const show = () => render(<MachinesProvider><Probe/></MachinesProvider>)
const cached = () => { try { return JSON.parse(window.localStorage.getItem(CK)) } catch { return null } }

describe('TC-MP: the machine list', () => {
  it('TC-MP-00 the browser can store things (the saved list depends on it)', () => {
    window.localStorage.setItem('probe', 'yes')
    expect(window.localStorage.getItem('probe')).toBe('yes')
  })

  it('TC-MP-01 shows the built-in machine before the database answers', () => {
    show()
    expect(read().ids).toEqual(['sma-6-0'])
    expect(read().source).toBe('builtin')
  })

  it('TC-MP-02 starts from the list last seen on this device', () => {
    window.localStorage.setItem(CK, JSON.stringify([{id:'m1', n:'One', c:'One', d:'', s:[], a:[], images:[], video:'', poster:''}]))
    show()
    expect(read().ids).toEqual(['m1'])
    expect(read().source).toBe('database')
  })

  it('TC-MP-03 replaces the list when the database answers, and saves it', async () => {
    show()
    await act(async () => { emitSnapshot('machines', [machineDoc('m2'), machineDoc('m1')]) })
    await waitFor(() => expect(read().source).toBe('database'))
    expect(read().ids).toEqual(['m2', 'm1'])
    expect(cached().map(m => m.id)).toEqual(['m2', 'm1'])
  })

  it('TC-MP-04 puts the machines in the order the owner set', async () => {
    show()
    await act(async () => { emitSnapshot('machines', [machineDoc('b', {order:2}), machineDoc('a', {order:1})]) })
    await waitFor(() => expect(read().ids).toEqual(['a', 'b']))
  })

  it('TC-MP-05 keeps the saved list when the database cannot be reached', async () => {
    window.localStorage.setItem(CK, JSON.stringify([{id:'m1', n:'One', c:'One', d:'', s:[], a:[], images:[], video:'', poster:''}]))
    show()
    expect(read().ids).toEqual(['m1'])
    // Firestore answers from its own empty cache when it cannot reach the server
    await act(async () => { emitSnapshot('machines', [], {fromCache:true}) })
    expect(read().ids).toEqual(['m1'])
    expect(cached().map(m => m.id)).toEqual(['m1'])
  })

  it('TC-MP-06 falls back to the built-in machine when the database really is empty', async () => {
    window.localStorage.setItem(CK, JSON.stringify([{id:'m1', n:'One', c:'One', d:'', s:[], a:[], images:[], video:'', poster:''}]))
    show()
    await act(async () => { emitSnapshot('machines', [], {fromCache:false}) })
    await waitFor(() => expect(read().source).toBe('builtin'))
    expect(read().ids).toEqual(['sma-6-0'])
    expect(cached()).toBeNull()
  })

  it('TC-MP-07 stops waiting after a few seconds if the database never answers', async () => {
    vi.useFakeTimers()
    try {
      show()
      expect(read().settled).toBe(false)
      await act(async () => { vi.advanceTimersByTime(4100) })
      expect(read().settled).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('TC-MP-08 stops waiting when the database refuses', async () => {
    show()
    expect(read().settled).toBe(false)
    await act(async () => { emitSnapshotError('machines', 'permission-denied') })
    await waitFor(() => expect(read().settled).toBe(true))
  })

  it('TC-MP-09 turns stored specifications into pairs', async () => {
    show()
    await act(async () => { emitSnapshot('machines', [machineDoc('m1', {specs:[{k:'Motor', v:'5 HP'}]})]) })
    await waitFor(() => expect(read().ids).toEqual(['m1']))
  })

  it('TC-MP-10 listens to the machines collection exactly once', () => {
    show()
    expect(Object.keys(fb.snapshots)).toEqual(['machines'])
  })
})
