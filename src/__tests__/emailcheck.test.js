import {describe, it, expect, vi, beforeEach} from 'vitest'
import {checkEmail} from '../emailcheck.js'

// the real check asks dns.google whether the domain can receive mail
const dns = (answer = {Status:0, Answer:[{type:15, data:'10 mx.example.'}]}) =>
  vi.fn(async () => new Response(JSON.stringify(answer)))

describe('TC-EM: email checks at registration', () => {
  beforeEach(() => { global.fetch = dns() })

  it('TC-EM-01 rejects text that is not an email', async () => {
    expect((await checkEmail('not-an-email')).ok).toBe(false)
  })
  it('TC-EM-02 rejects a domain with no dot', async () => {
    expect((await checkEmail('a@localhost')).ok).toBe(false)
  })
  it('TC-EM-03 rejects an empty value', async () => {
    expect((await checkEmail('')).ok).toBe(false)
  })
  it('TC-EM-04 rejects a domain that starts with a dot', async () => {
    expect((await checkEmail('a@.com')).ok).toBe(false)
  })
  it('TC-EM-05 trims spaces and lowercases', async () => {
    expect((await checkEmail('  ABCDEF@GMAIL.COM  ')).ok).toBe(true)
  })
  it('TC-EM-06 rejects a throwaway address', async () => {
    const r = await checkEmail('me@mailinator.com')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/Temporary email/)
  })
  it('TC-EM-07 rejects a Gmail name shorter than 6', async () => {
    expect((await checkEmail('ab@gmail.com')).ok).toBe(false)
  })
  it('TC-EM-08 accepts a Gmail name of exactly 6', async () => {
    expect((await checkEmail('abcdef@gmail.com')).ok).toBe(true)
  })
  it('TC-EM-09 ignores dots in a Gmail name', async () => {
    expect((await checkEmail('a.b.c.d.e.f@gmail.com')).ok).toBe(true)
  })
  it('TC-EM-10 allows a +tag on Gmail', async () => {
    expect((await checkEmail('abcdef+shop@gmail.com')).ok).toBe(true)
  })
  it('TC-EM-11 rejects two dots in a row on Gmail', async () => {
    expect((await checkEmail('ab..cdef@gmail.com')).ok).toBe(false)
  })
  it('TC-EM-12 rejects an underscore in a Gmail name', async () => {
    expect((await checkEmail('abc_def@gmail.com')).ok).toBe(false)
  })
  it('TC-EM-13 offers a correction for gmil.com', async () => {
    const r = await checkEmail('user@gmil.com')
    expect(r.ok).toBe(false)
    expect(r.suggestion).toBe('user@gmail.com')
    expect(r.canKeep).toBe(true)
  })
  it('TC-EM-14 offers a correction for gmail.con', async () => {
    expect((await checkEmail('user@gmail.con')).suggestion).toBe('user@gmail.com')
  })
  it('TC-EM-15 lets the person keep an address it called a typo', async () => {
    expect((await checkEmail('user@gmil.com', {allowTypo:true})).ok).toBe(true)
  })
  it('TC-EM-16 does not call a real lookalike domain a typo', async () => {
    expect((await checkEmail('user@yahoo.co.in')).ok).toBe(true)
  })
  it('TC-EM-17 accepts an ordinary company domain', async () => {
    expect((await checkEmail('shyam@truetracking.in')).ok).toBe(true)
  })
  it('TC-EM-18 rejects a domain that does not exist', async () => {
    global.fetch = dns({Status:3})
    const r = await checkEmail('user@nope.example')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/does not exist/)
  })
  it('TC-EM-19 accepts when the domain has an A record but no MX', async () => {
    global.fetch = vi.fn(async url => new Response(JSON.stringify(
      String(url).includes('type=MX') ? {Status:0, Answer:[]} : {Status:0, Answer:[{type:1, data:'1.2.3.4'}]})))
    expect((await checkEmail('user@a-only.example')).ok).toBe(true)
  })
  it('TC-EM-20 does not block the person when the DNS lookup fails', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') })
    expect((await checkEmail('user@unknown.example')).ok).toBe(true)
  })
})
