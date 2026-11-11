// These run the real firestore.rules inside the Firestore emulator, the way the server will.
// Nothing here is mocked: every call is refused or allowed by the published rules themselves.
import {readFileSync} from 'node:fs'
import {describe, it, beforeAll, afterAll, beforeEach} from 'vitest'
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing'
import {doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where} from 'firebase/firestore'

const SETUP_CODE = 'SM-Q338HG9Q3X6K'   // the line marked CODE in firestore.rules
let env

// uid-owner is the owner, uid-a and uid-b are ordinary members
const owner = () => env.authenticatedContext('uid-owner').firestore()            // admins never verify their email
const member = (uid = 'uid-a') => env.authenticatedContext(uid, {email_verified: true}).firestore()
const unverified = (uid = 'uid-a') => env.authenticatedContext(uid, {email_verified: false}).firestore()
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

describe('TC-SR-U: member profiles', () => {
  it('TC-SR-U-01 a member can read their own profile', async () => {
    await seed(db => setDoc(doc(db, 'users/uid-a'), {name:'Shyam'}))
    await assertSucceeds(getDoc(doc(member(), 'users/uid-a')))
  })
  it('TC-SR-U-02 a member cannot read someone else profile', async () => {
    await seed(db => setDoc(doc(db, 'users/uid-b'), {name:'Other'}))
    await assertFails(getDoc(doc(member('uid-a'), 'users/uid-b')))
  })
  it('TC-SR-U-03 a member can save their own profile', async () => {
    await assertSucceeds(setDoc(doc(member(), 'users/uid-a'), {name:'Shyam', mobile:'9876543210'}))
  })
  it('TC-SR-U-04 a member cannot write into someone else profile', async () => {
    await assertFails(setDoc(doc(member('uid-a'), 'users/uid-b'), {name:'Hacked'}))
  })
  it('TC-SR-U-05 the owner can read any profile', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'users/uid-a'), {name:'Shyam'}))
    await assertSucceeds(getDoc(doc(owner(), 'users/uid-a')))
  })
  it('TC-SR-U-06 a visitor cannot read a profile', async () => {
    await seed(db => setDoc(doc(db, 'users/uid-a'), {name:'Shyam'}))
    await assertFails(getDoc(doc(visitor(), 'users/uid-a')))
  })
})

describe('TC-SR-M: machines', () => {
  it('TC-SR-M-01 anyone, even signed out, can read the machines', async () => {
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertSucceeds(getDoc(doc(visitor(), 'machines/m1')))
  })
  it('TC-SR-M-02 anyone can list the machines', async () => {
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertSucceeds(getDocs(collection(visitor(), 'machines')))
  })
  it('TC-SR-M-03 a member cannot add a machine', async () => {
    await assertFails(setDoc(doc(member(), 'machines/m2'), {n:'Fake'}))
  })
  it('TC-SR-M-04 the owner can add a machine', async () => {
    await makeOwner()
    await assertSucceeds(setDoc(doc(owner(), 'machines/m2'), {n:'SMA 7.0'}))
  })
  it('TC-SR-M-05 the owner can change a machine', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertSucceeds(updateDoc(doc(owner(), 'machines/m1'), {n:'SMA 6.1'}))
  })
  it('TC-SR-M-06 the owner can delete a machine', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertSucceeds(deleteDoc(doc(owner(), 'machines/m1')))
  })
  it('TC-SR-M-07 a member cannot delete a machine', async () => {
    await seed(db => setDoc(doc(db, 'machines/m1'), {n:'SMA 6.0'}))
    await assertFails(deleteDoc(doc(member(), 'machines/m1')))
  })
  it('TC-SR-M-08 a visitor cannot add a machine', async () => {
    await assertFails(setDoc(doc(visitor(), 'machines/m2'), {n:'Fake'}))
  })
})

describe('TC-SR-E: enquiries', () => {
  it('TC-SR-E-01 a verified member can send their own enquiry', async () => {
    await assertSucceeds(setDoc(doc(member(), 'enquiries/e1'), enquiry('uid-a')))
  })
  it('TC-SR-E-02 a member who has not verified their email cannot', async () => {
    await assertFails(setDoc(doc(unverified(), 'enquiries/e1'), enquiry('uid-a')))
  })
  it('TC-SR-E-03 a visitor cannot send an enquiry', async () => {
    await assertFails(setDoc(doc(visitor(), 'enquiries/e1'), enquiry('uid-a')))
  })
  it('TC-SR-E-04 an enquiry cannot be filed under someone else name', async () => {
    await assertFails(setDoc(doc(member('uid-a'), 'enquiries/e1'), enquiry('uid-b')))
  })
  it('TC-SR-E-05 extra fields are refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry('uid-a', {isAdmin:true})))
  })
  it('TC-SR-E-06 a message of 2000 characters or more is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry('uid-a', {message:'x'.repeat(2000)})))
  })
  it('TC-SR-E-07 a long but allowed message goes through', async () => {
    await assertSucceeds(setDoc(doc(member(), 'enquiries/e1'), enquiry('uid-a', {message:'x'.repeat(1999)})))
  })
  it('TC-SR-E-08 a message that is not text is refused', async () => {
    await assertFails(setDoc(doc(member(), 'enquiries/e1'), enquiry('uid-a', {message:12345})))
  })
  it('TC-SR-E-09 a member can read their own enquiry', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertSucceeds(getDoc(doc(member('uid-a'), 'enquiries/e1')))
  })
  it('TC-SR-E-10 a member cannot read someone else enquiry', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-b')))
    await assertFails(getDoc(doc(member('uid-a'), 'enquiries/e1')))
  })
  it('TC-SR-E-11 a member can list only their own enquiries', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    const db = member('uid-a')
    await assertSucceeds(getDocs(query(collection(db, 'enquiries'), where('uid', '==', 'uid-a'))))
  })
  it('TC-SR-E-12 a member cannot list everybody enquiries', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertFails(getDocs(collection(member('uid-a'), 'enquiries')))
  })
  it('TC-SR-E-13 the owner can read every enquiry, without verifying an email', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertSucceeds(getDocs(collection(owner(), 'enquiries')))
  })
  it('TC-SR-E-14 an enquiry cannot be changed once it is sent', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertFails(updateDoc(doc(member('uid-a'), 'enquiries/e1'), {message:'changed'}))
  })
  it('TC-SR-E-15 not even the owner can change an enquiry', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertFails(updateDoc(doc(owner(), 'enquiries/e1'), {message:'changed'}))
  })
  it('TC-SR-E-16 a member cannot delete an enquiry', async () => {
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertFails(deleteDoc(doc(member('uid-a'), 'enquiries/e1')))
  })
  it('TC-SR-E-17 the owner can delete an old enquiry', async () => {
    await makeOwner()
    await seed(db => setDoc(doc(db, 'enquiries/e1'), enquiry('uid-a')))
    await assertSucceeds(deleteDoc(doc(owner(), 'enquiries/e1')))
  })
})

describe('TC-SR-A: claiming the owner account', () => {
  it('TC-SR-A-01 the first owner can claim it with the right code', async () => {
    await assertSucceeds(setDoc(doc(member(), 'admins/uid-a'), {code:SETUP_CODE, email:'o@e.com', createdAt:new Date()}))
  })
  it('TC-SR-A-02 a wrong code is refused', async () => {
    await assertFails(setDoc(doc(member(), 'admins/uid-a'), {code:'WRONG', email:'o@e.com'}))
  })
  it('TC-SR-A-03 nobody can make someone else an owner', async () => {
    await assertFails(setDoc(doc(member('uid-a'), 'admins/uid-b'), {code:SETUP_CODE, email:'o@e.com'}))
  })
  it('TC-SR-A-04 a visitor cannot claim it', async () => {
    await assertFails(setDoc(doc(visitor(), 'admins/uid-a'), {code:SETUP_CODE, email:'o@e.com'}))
  })
  it('TC-SR-A-05 once setup is closed nobody can claim it, even with the code', async () => {
    await closeSetup()
    await assertFails(setDoc(doc(member(), 'admins/uid-a'), {code:SETUP_CODE, email:'o@e.com'}))
  })
  it('TC-SR-A-06 a person can check whether they are the owner', async () => {
    await makeOwner()
    await assertSucceeds(getDoc(doc(env.authenticatedContext('uid-owner').firestore(), 'admins/uid-owner')))
  })
  it('TC-SR-A-07 nobody can look up whether somebody else is the owner', async () => {
    await makeOwner()
    await assertFails(getDoc(doc(member('uid-a'), 'admins/uid-owner')))
  })
  it('TC-SR-A-08 an owner entry cannot be edited', async () => {
    await makeOwner()
    await assertFails(updateDoc(doc(env.authenticatedContext('uid-owner').firestore(), 'admins/uid-owner'), {email:'new@e.com'}))
  })
  it('TC-SR-A-09 an owner entry cannot be deleted', async () => {
    await makeOwner()
    await assertFails(deleteDoc(doc(env.authenticatedContext('uid-owner').firestore(), 'admins/uid-owner')))
  })
  it('TC-SR-A-10 the owner list cannot be browsed', async () => {
    await makeOwner()
    await assertFails(getDocs(collection(member('uid-a'), 'admins')))
  })
})

describe('TC-SR-S: the setup lock', () => {
  it('TC-SR-S-01 anyone can check whether setup is still open', async () => {
    await closeSetup()
    await assertSucceeds(getDoc(doc(visitor(), 'meta/adminSetup')))
  })
  it('TC-SR-S-02 an owner can close the setup', async () => {
    await makeOwner()
    await assertSucceeds(setDoc(doc(owner(), 'meta/adminSetup'), {done:'1', createdAt:new Date()}))
  })
  it('TC-SR-S-03 someone who is not the owner cannot close the setup', async () => {
    await assertFails(setDoc(doc(member(), 'meta/adminSetup'), {done:'1'}))
  })
  it('TC-SR-S-04 the setup cannot be closed twice', async () => {
    await makeOwner()
    await closeSetup()
    await assertFails(setDoc(doc(owner(), 'meta/adminSetup'), {done:'2'}))
  })
  it('TC-SR-S-05 the setup lock cannot be deleted to reopen setup', async () => {
    await makeOwner()
    await closeSetup()
    await assertFails(deleteDoc(doc(owner(), 'meta/adminSetup')))
  })
})
