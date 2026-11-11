# Performance report — SM Automation

**Date:** 30 October 2026
**Scope:** the production build (`npm run build`), served and loaded in a real browser against the
live Firebase project `sm-automation-3ad86`.
**Method:** build output, the browser's own Resource Timing and Navigation Timing figures, and the
network traffic of a real page load.

**Result: 5 issues found, 4 fixed, 2 left as observations for you to decide on.** One fix removed a
request that was taking almost two seconds on every owner page load; another cut 23 KB from the
first load for every visitor who never signs in.

> **Correction, 30 October.** The first version of this report said PERF-01 was fixed. It was fixed
> only for a device that already remembered the owner. On the owner's **first** sign-in on a device
> the wasted request was still being made, and a fresh browser measured it at **1880 ms**. It is now
> fixed for both, and `TC-AU-15` fails if it ever comes back. The claim "`failedRequests: []`" in the
> first version was measured on a return visit, which was the case the fix covered.

---

## What the site weighs

| File | Transferred (gzip) | Decoded | Loaded on |
|---|---|---|---|
| `firebase-*.js` (Firestore) | **80 KB** | 323 KB | every page |
| `firebase-auth-*.js` | 37 KB | 190 KB | only once somebody signs in |
| `vendor-*.js` (React, Router) | 55 KB | 168 KB | every page |
| `index-*.js` (the site itself) | 15 KB | 49 KB | every page |
| `index-*.css` | 6 KB | 22 KB | every page |
| Web fonts (2 families) | 40 KB | 40 KB | every page |
| **First load total** | **≈157 KB** | ≈563 KB | was ≈180 KB before the split |

Media is extra and loads conditionally:

| File | Size | When |
|---|---|---|
| `videos/hero-loop.mp4` | 923 KB | home page, desktop only — skipped on narrow screens, with data saver on, or when reduced motion is set |
| `videos/sma-6-0.mp4` | 1.85 MB | machine page, `preload="metadata"` so only a few KB until played |
| `images/sma-6-0.jpg` | 185 KB | machine page |
| other images | 184 KB total | various |

---

## Findings

### PERF-01 — A wasted request on every owner page load, taking 1.9 s · **Fixed**

Every time the owner loaded any page, the app asked Firestore for
`users/{uid}` — a profile document owners never have, because `/admin/setup` does not create one.
The reply was a 404. It was handled quietly in the code, but the request still went out, **took
1891 ms**, and logged an error in the browser console that would mask a real one.

**Fix, first attempt:** the profile was no longer requested for an account **already known** to be
the owner — that is, on a device that had signed in before and remembered it. That left the first
sign-in on any device still paying for the request, which a fresh browser measured at **1880 ms**.

**Fix, as it now stands:** whether this is the owner only becomes clear once the owner check
answers, so the profile now waits for that answer instead of guessing. Nothing is requested on a
device that remembers the owner, and nothing is requested on the owner's first sign-in either. The
cost falls on members, who wait one extra round trip before their name appears on the dashboard —
no page waits for it, and `TC-AU-16` holds that the name still arrives.

Verified in a browser against the live project with everything cleared first: the owner's first
sign-in makes **one** Firestore document call (`admins/{uid}`, 1862 ms), no `users/{uid}` call at
all, and `failedRequests: []`. Pinned by `TC-AU-15`, which fails on the old code.

### PERF-02 — Every image loaded immediately, however far down the page · **Fixed**

No image carried `loading="lazy"`. With one machine that hardly matters; the home page already
renders **four copies of every machine photo** in the moving strip, so with a real catalogue of
nine machines that is 72 image elements all fetched at once.

**Fix:** `loading="lazy"` and `decoding="async"` on card thumbnails, strip images, enquiry rows and
editor thumbnails. On a machine page the **first** photo is deliberately left eager and marked
`fetchpriority="high"`, because it is the largest thing on screen and lazy-loading it would make
the page feel slower, not faster.

### PERF-03 — No early connection to Firestore · **Fixed**

`index.html` pre-connected to the Google Fonts hosts but not to `firestore.googleapis.com`, which
the app contacts as soon as the bundle runs. On a mobile connection the DNS lookup and TLS
handshake alone can cost 100–300 ms before the first byte.

**Fix:** `<link rel="preconnect" href="https://firestore.googleapis.com" crossorigin>` added.

### PERF-04 — The Firebase SDK was 104 KB on every page · **Fixed**

The largest single item on first load. It was pulled in on the home, about and machines pages,
which only read the machine list — signing in is needed on four routes out of ten, and never for
someone who just reads the site.

**Fix:** the sign-in half of Firebase is now fetched on demand. `firebase.js` exposes `loadAuth()`,
which imports `firebase/auth` once and shares it; `auth.jsx` goes through that instead of a
top-level import. A note in the browser records that somebody has signed in on this device, so a
return visit restores the session straight away while a first-time visitor never fetches the code
at all.

| Visitor | First load (gzipped) | Change |
|---|---|---|
| Before, everybody | 180.5 KB | — |
| After, never signs in | **157.1 KB** | **−23.4 KB (−13%)** |
| After, signs in | 194.5 KB | +14.0 KB, fetched once the page is already usable |

**The trade is deliberate and worth stating.** Split out, the sign-in chunk cannot share as much
compressed code with the main bundle, so it is 37.4 KB on its own where it added 24 KB inside the
old chunk. Someone who logs in therefore downloads about 14 KB more in total — but not before the
page is interactive, and on a site where most visitors never sign in, the trade favours them. I
checked this was not an artefact of how the chunks are named: letting the bundler place the code
itself produced byte-identical output.

**Verified in a browser** against the live project, with storage cleared first:

- A new visitor loads the home page, sees the machines from Firestore and the correct menu —
  and the sign-in chunk is **not fetched at all**.
- Pressing Log in fetches it on demand (36 KB, 26 seconds into the session) and signing in works.
- A return visit restores the session, shows the owner's menu and the Admin page, with no failed
  requests.

### PERF-05 — Images could be ~26% smaller as WebP · **Recommendation**

I measured this rather than assumed it, and the usual advice turned out to be wrong here: **your
JPEGs are already well compressed.** Re-encoding `sma-6-0.jpg` and `hero-poster.jpg` at quality 82
makes them *larger*. Nothing to gain there.

WebP is a different matter — the same four images come to 258 KB instead of 349 KB, a saving of
**91 KB (26%)**. It needs `<picture>` elements with JPEG fallbacks, so it is a real change for a
modest gain. Worth doing when you next touch the gallery; not urgent.

Machine photos uploaded through the admin page are unaffected either way: Cloudinary already
serves those as `f_auto,q_auto`, which picks WebP or AVIF per browser automatically.

### PERF-06 — The hero photo is preloaded on every page, and used on one · **Observation, not applied**

`index.html` preloads `/images/hero-poster.jpg` (51 KB), which only the home page shows. One
`index.html` serves every route, so the other nine fetch it and never draw it. Confirmed in a
browser on `/machines`, `/machines/sma-6-0` and `/admin`, each of which logs *"preloaded using link
preload but not used"*.

**I have not applied a fix, and the reason is worth stating.** The preload is what starts that image
before the JavaScript bundle has run, so on a slow connection it is holding up the home page's
largest paint. The clean fix is to stop serving the hint on every route and attach it only to `/`,
as a response header in `firebase.json`:

```json
{ "source": "/", "headers": [
  { "key": "Link", "value": "</images/hero-poster.jpg>; rel=preload; as=image" } ] }
```

Firebase Hosting matches `source` against the requested path, so `/machines` would not receive it.
I cannot confirm that against real Hosting from here, and getting it wrong costs the home page its
head start on the one image that matters. The waste meanwhile is 51 KB **once a week** per visitor,
because `/images/**` is cached for seven days. Apply it after a deploy, and check with the browser
console on `/machines` that the warning is gone and on `/` that the preload still happens.

### PERF-07 — The owner's sign-in stops at the dashboard on the way to Admin · **Observation**

Signing in as the owner briefly renders the member dashboard before the admin check answers, which
fires an enquiries query that is then thrown away — **1570 ms** measured on the live project, plus a
flash of the wrong page.

This is the routing working as written: the login page sends anyone signed in to the dashboard, and
`Protected` moves the owner on to Admin "as soon as it is known". Waiting for the owner check before
that first redirect would be worse, because it would hold everyone on a blank login page for as long
as the check takes — 1862 ms here. It only happens on a first sign-in; a device that remembers the
owner goes straight to Admin. Left alone deliberately.

---

## Checked and found sound

| Area | Result |
|---|---|
| Code splitting | `vite.config.js` already separates Firebase and vendor code from the site's own, so a change to the site invalidates only a 15 KB file rather than the whole bundle. |
| Cache headers | Hashed assets are immutable for a year, images and videos for a week, `index.html` is never cached. Correct. |
| The hero video | Already withheld on narrow screens, with data saver on, and when reduced motion is set, and only started after the page has loaded. Good as it stands. |
| Machine video | `preload="metadata"` — the 1.85 MB file is not pulled down until someone presses play. |
| Layout stability | No layout shift measured on load. |
| Machine list reads | One live subscription for the whole site, shared by every page, with the last result kept on the device so a repeat visit draws instantly. |
| Local server timings | Time to first byte 4 ms, DOM interactive 34 ms, load 91 ms. Useful only as a floor — they say nothing about real network conditions. |

---

## What could not be measured here

The browser pane used for this work does not emit **First Contentful Paint** or **Largest
Contentful Paint** entries, so those are absent from this report rather than estimated. The
payload figures above are network-independent and stand on their own, but for real field numbers
run Lighthouse in Chrome against the deployed site, on a throttled mobile profile.

---

## Verification

```bash
npm test           # 222 cases
npm run test:rules # 82 cases
npm run build      # production build
```

All pass after the changes. The fixes were confirmed in a real browser against the live project,
with stored data cleared first: no failed requests on the owner's first sign-in or on a return
visit, lazy attributes present on the images that should have them and absent on the first machine
photo, and the Firestore preconnect in place.
