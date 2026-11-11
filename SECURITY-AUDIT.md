# Security audit — SM Automation

**Date:** 30 October 2026
**Scope:** the React client, `firestore.rules`, the Firebase Hosting configuration, the shipped
production bundle, and the dependency tree.
**Method:** dependency scan, static review of the source, inspection of the built bundle for
leaked values, rule-by-rule review of `firestore.rules` exercised against the Firestore emulator,
and checks against the live project `sm-automation-3ad86`.

**Result: 5 issues found. 4 fixed, 1 needs a change in the Cloudinary dashboard that only the
account holder can make.** No evidence of a compromise, and no issue that exposes customer data
to a stranger.

---

## Findings

### SEC-01 — Enquiry fields other than the message accepted anything · Medium · **Fixed**

`firestore.rules` checked that `message` was text under 2000 characters, but `name`, `mobile`,
`email`, `company` and `machineId` were not checked at all. Any signed-in account with a verified
email could therefore write up to Firestore's 1 MiB limit into any of those five fields, as often
as it liked, and the owner would see the junk in Admin > Enquiries.

**Fix:** every field is now type-checked and size-capped — name 120, mobile 30, email 200,
company 160, machine id 100 characters. Covered by `TC-SEC-E-01` to `TC-SEC-E-08`.

### SEC-02 — A member profile could hold arbitrary data · Medium · **Fixed**

`match /users/{uid}` allowed `read, write` with no constraint on the content, so a signed-in
account could store any fields of any size in its own profile document. The app only ever writes
`name`, `mobile` and `email`.

**Fix:** creates and updates are restricted to those three fields, each validated as text within a
size limit; a field left out is still fine, so partial updates keep working. Reads and deletes are
unchanged. Covered by `TC-SEC-U-01` to `TC-SEC-U-06`.

### SEC-03 — No security response headers · Medium · **Fixed**

`firebase.json` set cache headers only. The site had no Content-Security-Policy, and no
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` or `Permissions-Policy`. Nothing
stopped the site being framed by another page (clickjacking), and there was no second line of
defence behind React's own escaping on the enquiry text the owner reads.

**Fix:** all six headers added, including a Content-Security-Policy built from the origins the app
actually uses, confirmed by watching its network traffic rather than guessed:

| Directive | Allowed |
|---|---|
| `script-src` | the site itself |
| `style-src` | the site, inline styles (React needs these), Google Fonts |
| `font-src` | the site, `fonts.gstatic.com` |
| `img-src` / `media-src` | the site, `data:`, `res.cloudinary.com` |
| `connect-src` | Firestore, Identity Toolkit, Secure Token, Cloudinary, `dns.google` |
| `frame-ancestors`, `object-src`, `frame-src` | nothing |

**This needed a code change to work.** `index.html` loaded the web fonts with an inline
`onload="this.media='all'"` handler. A strict policy refuses to run inline handlers, so the
stylesheet would have stayed on `media="print"` and the site would have rendered unstyled. The
swap now happens in `main.jsx`. Verified by serving the built site with the policy applied: fonts
applied, machines loaded from Firestore, admin login worked, **no violations reported**.

### SEC-04 — The Cloudinary upload preset is readable in the bundle · Low to Medium · **Needs your action**

The production bundle contains `VITE_CLOUDINARY_CLOUD_NAME` and
`VITE_CLOUDINARY_UPLOAD_PRESET` in clear text. That is unavoidable for unsigned browser uploads
and your README already notes it, but it means anyone who reads the bundle can upload files to
your Cloudinary account and spend your quota. Nothing in the website limits this.

**Cannot be fixed in code.** In the Cloudinary dashboard, under Settings > Upload > your preset,
restrict it: allowed formats to images and video only, a maximum file size, and a fixed folder.
Then watch the usage figures.

### SEC-05 — WhatsApp was opened with a handle back to the website · Low · **Fixed**

The enquiry form opens WhatsApp with `window.open(url, '_blank')`. A `target="_blank"` link gets
`noopener` from the browser for nothing these days; **`window.open` does not** — the page it opens
keeps a `window.opener` reference and can navigate the page it came from. That is reverse
tabnabbing: the opened page replaces the site behind it with a copy that asks for a password.

`wa.me` is not the threat here. The point is that the site hands out that handle at all, on the one
screen where the person is in the middle of something and would come back to whatever is waiting.

**Fix:** both calls go through one helper that passes `noopener`. Covered by `TC-EQ-04`, which now
checks the arguments as well as the address.

---

## Checked and found sound

| Area | Result |
|---|---|
| Secrets in the bundle | The admin setup code is **not** in the client — it lives only in `firestore.rules`, where the server enforces it. No passwords present. |
| Firebase API key exposure | Present in the bundle, as it must be. This is public by design; the rules are what protect the data, and they do. |
| Cross-site scripting | No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` or `document.write` anywhere. Enquiry text, which the owner reads back, is escaped by React. |
| Published rules vs the file | Checked against the live project as a stranger: machines readable, `users`, `enquiries` and `admins` each refused. The published rules match the tested file. |
| Owner account | `/admin/setup` is closed on this project, and the rules make the setup code useless once it is. A second owner cannot be created. |
| Authentication provider | Email/Password enabled; email enumeration protection is on, so Firebase will not confirm whether an address is registered. |
| Default deny | Collections the rules do not name are refused for everyone, owner included (`TC-SR-X-01` to `TC-SR-X-03`). |
| Open redirect | `react-router` 6.30.6 carries an open-redirect advisory, but the only redirect the app builds from data is `Guest`, whose target comes from the path of a protected route — always `/dashboard`, `/admin` or `/enquire/…`. It cannot be pointed off-site. |

---

## Dependencies

`npm audit` reports 21 advisories: 3 critical, 7 high, 11 moderate. Almost all are in build and
test tooling that never reaches a browser — `vitest`, `tinypool`, `vite`, `esbuild`, `undici`,
`@grpc/grpc-js`. Confirmed by searching the built bundle: none of them are in it.

Two reach the browser, neither exploitable here:

- **react-router 6.30.6** — open redirect via backslash. Not reachable, as set out above.
- **firebase 10.14.1** — the advisories against it are in its Node-only paths (`undici`,
  `@grpc/grpc-js`), which the web SDK does not use.

> **Do not run `npm audit fix --force`.** For `firebase` it proposes "fixing" 10.14.1 by installing
> **9.14.0**, which is older and would break the app. Upgrade deliberately instead: `firebase` to
> the current 11.x and `react-router-dom` to 7.x, each with the suite run afterwards.

---

## Verification

Every fix is covered by tests that run on demand:

```bash
npm test          # 222 cases
npm run test:rules # 82 cases against the Firestore emulator
```

Both suites pass. The 14 rule cases (`TC-SEC-E-*`, `TC-SEC-U-*`) fail if the size and type limits
are ever removed, and `TC-EQ-04` fails if `noopener` is dropped again.
