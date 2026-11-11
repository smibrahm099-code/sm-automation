// Rule paths the first rules file did not reach, found by auditing every allow line in
// firestore.rules against the cases that existed.
import {readFileSync} from 'node:fs'
import {describe, it, beforeAll, afterAll, beforeEach} from 'vitest'
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing'
import {doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs} from 'firebase/firestore'

const SETUP_CODE = 'SM-Q338HG9Q3X6K'
let env

const owner = () => env.authenticatedContext('uid-owner').firestore()
const member = (uid = 'uid-a') => env.authenticatedContext(uid, {email_verified: true}).firestore()
const visitor = () => env.unauthenticatedContext().firestore()

const enquiry = (uid, over = {}) => ({
  uid, name:'Shyam', mobile:'9876543210', email:'u@e.com',
  company:'True Tracking', machineId:'m1', message:'Need a quote', createdAt:new Date(), ...over})

const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()))
const makeOwner = () => seed(db => setDoc(doc(db, 'admins/uid-owner'), {code:SETUP_CODE, email:'owner@e.com'}))
const closeSetup = () => seed(db => setDoc(doc(db, 'meta/adminSetup'), {done:'1'}))

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sm-automation',
    firestore: {rules: readFileSync('firestore.rules', 'utf8'), host:'127.0.0.1', port:8080},
  })
})
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

describe('TC-SR-U: member profiles (further paths)', () => {
  it('TC-SR-U-07 the owner can read a profile but cannot change one', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'users/uid-a'), {name:'Shyam'}))
    await assertSucceeds(getDoc(doc(owner(), 'users/uid-a')))
    await assertFails(updateDoc(doc(owner(), 'users/uid-a'), {name:'Changed by owner'}))
  })
  it('TC-SR-U-08 the owner cannot delete a member profile', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'users/uid-a'), {name:'Shyam'}))
    await assertFails(deleteDoc(doc(owner(), 'users/uid-a')))
  })
  it('TC-SR-U-09 a member can delete their own profile', async () => {
    await seed(db => setDoc(doc(db, 'users/uid-a'), {name:'Shyam'}))
    await assertSucceeds(deleteDoc(doc(member('uid-a'), 'users/uid-a')))
  })
  it('TC-SR-U-10 a visitor cannot write a profile', async () => {
    await assertFails(setDoc(doc(visitor(), 'users/uid-a'), {name:'Hacked'}))
  })
  it('TC-SR-U-11 the profile list cannot be browsed by a member', async () => {
    await seed(db => setDoc(doc(db, 'users/uid-b'), {name:'Other'}))
    await assertFails(getDocs(collection(member('uid-a'), 'users')))
  })
})

describe('TC-SR-M: machines (further paths)', () => {
  it('TC-SR-M-09 a member cannot change a machine', async () => {
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertFails(updateDoc(doc(member(), 'machines/m1'), {n:'Hacked'}))
  })
  it('TC-SR-M-10 a visitor cannot change a machine', async () => {
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertFails(updateDoc(doc(visitor(), 'machines/m1'), {n:'Hacked'}))
  })
  it('TC-SR-M-11 a visitor cannot delete a machine', async () => {
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertFails(deleteDoc(doc(visitor(), 'machines/m1')))
  })
})

describe('TC-SR-E: enquiries (further paths)', () => {
  it('TC-SR-E-18 the owner cannot send an enquiry, having no verified email', async () => {
    await makeOwner()
    await assertFails(setDoc(doc(owner(), 'enquiries/e1'), enquiry('uid-owner')))
  })
  it('TC-SR-E-19 an enquiry with no message is refused', async () => {
    const {message, ...withoutMessage} = enquiry('uid-a')
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), withoutMessage))
  })
  it('TC-SR-E-20 an enquiry with no owner id is refused', async () => {
    const {uid, ...withoutUid} = enquiry('uid-a')
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), withoutUid))
  })
  it('TC-SR-E-21 a visitor cannot read an enquiry', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertFails(getDoc(doc(visitor(), 'enquiries/e1')))
  })
  it('TC-SR-E-22 a visitor cannot delete an enquiry', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertFails(deleteDoc(doc(visitor(), 'enquiries/e1')))
  })
  it('TC-SR-E-23 a message of exactly 2000 characters is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry('uid-a', {message:'x'.repeat(2000)})))
  })
})

describe('TC-SR-A: claiming the owner account (further paths)', () => {
  it('TC-SR-A-11 a member may look up their own entry even when they are not the owner', async () => {
    await assertSucceeds(getDoc(doc(member('uid-a'), 'admins/uid-a')))
  })
  it('TC-SR-A-12 an owner entry cannot be replaced wholesale', async () => {
    await makeOwner()
    await assertFails(setDoc(doc(env.authenticatedContext('uid-owner').firestore(), 'admins/uid-owner'),
      {code:SETUP_CODE, email:'new@e.com'}))
  })
})

describe('TC-SR-S: the setup lock (further paths)', () => {
  it('TC-SR-S-06 the setup lock cannot be edited', async () => {
    await makeOwner()
    await closeSetup()
    await assertFails(updateDoc(doc(owner(), 'meta/adminSetup'), {done:'0'}))
  })
  it('TC-SR-S-07 the meta collection cannot be listed', async () => {
    await closeSetup()
    await assertFails(getDocs(collection(visitor(), 'meta')))
  })
  it('TC-SR-S-08 another document under meta cannot be read or written', async () => {
    await seed(db => setDoc(doc(db, 'meta/secret'), {value:'hidden'}))
    await assertFails(getDoc(doc(visitor(), 'meta/secret')))
    await assertFails(setDoc(doc(member(), 'meta/secret'), {value:'x'}))
  })
})

describe('TC-SR-X: anything the rules do not name', () => {
  it('TC-SR-X-01 a collection with no rule cannot be read', async () => {
    await seed(db => setDoc(doc(db, 'secrets/s1'), {value:'hidden'}))
    await assertFails(getDoc(doc(member(), 'secrets/s1')))
  })
  it('TC-SR-X-02 a collection with no rule cannot be written, even by the owner', async () => {
    await makeOwner()
    await assertFails(setDoc(doc(owner(), 'secrets/s1'), {value:'x'}))
  })
  it('TC-SR-X-03 a sub-collection under a machine cannot be written', async () => {
    await makeOwner()
    await assertFails(setDoc(doc(owner(), 'machines/m1/extras/e1'), {value:'x'}))
  })
})
