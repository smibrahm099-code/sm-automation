// Size and type limits added after a security audit found that only the enquiry message was
// checked. Without these, a signed-in account could store a megabyte in any other field.
import {readFileSync} from 'node:fs'
import {describe, it, beforeAll, afterAll, beforeEach} from 'vitest'
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing'
import {doc, setDoc} from 'firebase/firestore'

let env
const member = (uid = 'uid-a') => env.authenticatedContext(uid, {email_verified: true}).firestore()
const big = n => 'x'.repeat(n)
const enquiry = (over = {}) => ({
  uid:'uid-a', name:'Shyam', mobile:'9876543210', email:'u@e.com',
  company:'True Tracking', machineId:'m1', message:'Need a quote', createdAt:new Date(), ...over})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sm-automation',
    firestore: {rules: readFileSync('firestore.rules', 'utf8'), host:'127.0.0.1', port:8080},
  })
})
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

describe('TC-SEC-E: an enquiry cannot be used to store junk', () => {
  it('TC-SEC-E-01 a name of normal length is accepted', async () => {
    await assertSucceeds(setDoc(doc(member(), 'enquiries/e1'), enquiry({name: big(119)})))
  })
  it('TC-SEC-E-02 an oversized name is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry({name: big(120)})))
  })
  it('TC-SEC-E-03 a megabyte in the company field is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry({company: big(200000)})))
  })
  it('TC-SEC-E-04 an oversized mobile number is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry({mobile: big(30)})))
  })
  it('TC-SEC-E-05 an oversized email is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry({email: big(200)})))
  })
  it('TC-SEC-E-06 an oversized machine id is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry({machineId: big(100)})))
  })
  it('TC-SEC-E-07 a name that is not text is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry({name: 12345})))
  })
  it('TC-SEC-E-08 a company that is not text is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry({company: {nested:'object'}})))
  })
})

describe('TC-SEC-U: a profile cannot be used to store junk', () => {
  it('TC-SEC-U-01 an ordinary profile is accepted', async () => {
    await assertSucceeds(setDoc(doc(member(), 'users/uid-a'), {name:'Shyam', mobile:'9876543210', email:'u@e.com'}))
  })
  it('TC-SEC-U-02 a profile with only some fields is still accepted', async () => {
    await assertSucceeds(setDoc(doc(member(), 'users/uid-a'), {name:'Shyam', mobile:'9876543210'}))
  })
  it('TC-SEC-U-03 a field the profile does not use is refused', async () => {
    await assertFails(setDoc(doc(member(), 'users/uid-a'), {name:'Shyam', isAdmin:true}))
  })
  it('TC-SEC-U-04 a megabyte parked in the profile is refused', async () => {
    await assertFails(setDoc(doc(member(), 'users/uid-a'), {name: big(200000)}))
  })
  it('TC-SEC-U-05 an oversized mobile number is refused', async () => {
    await assertFails(setDoc(doc(member(), 'users/uid-a'), {mobile: big(30)}))
  })
  it('TC-SEC-U-06 a profile field that is not text is refused', async () => {
    await assertFails(setDoc(doc(member(), 'users/uid-a'), {name: ['an','array']}))
  })
})
