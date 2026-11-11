// auth.jsx talks to the Firestore REST API with plain fetch (so it still works when the SDK's live
// connection is blocked), and emailcheck.js asks dns.google about a domain. These tests answer both.
import {vi} from 'vitest'

export const rest = {handlers: [], calls: []}

const MX = {Status:0, Answer:[{type:15, data:'10 mx.example.'}]}

export function resetRest() {
  rest.calls = []
  // defaults, lowest priority: domains resolve, writes succeed, nothing exists to read
  rest.handlers = [
    url => url.includes('dns.google') && {status:200, body:MX},
    (url, o) => (o.method === 'POST') && {status:200, body:{}},
  ]
  global.fetch = vi.fn(async (url, opts = {}) => {
    rest.calls.push({url:String(url), method:opts.method || 'GET', body:opts.body})
    for (const h of rest.handlers) {
      const r = h(String(url), {method:'GET', ...opts})
      if (r) { if (r.after) await r.after; return new Response(JSON.stringify(r.body ?? {}), {status: r.status ?? 200}) }
    }
    return new Response(JSON.stringify({error:{message:'NOT_FOUND'}}), {status:404})
  })
}

export const onRest = handler => rest.handlers.unshift(handler)

export const docFields = obj => ({fields: Object.fromEntries(
  Object.entries(obj).map(([k, v]) => [k, {stringValue:String(v)}]))})

export const queryRows = rows => rows.map(r => ({document:{fields: Object.fromEntries(
  Object.entries(r).map(([k, v]) => [k, k === 'createdAt' ? {timestampValue:v} : {stringValue:String(v)}]))}}))

export const posted = name => rest.calls.filter(c => c.method === 'POST' && c.url.includes('/' + name + '?documentId='))
