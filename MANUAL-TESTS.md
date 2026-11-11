# Manual checks (TC-MAN)

The automated suites cover the code: `npm test` (209 cases) and `npm run test:rules` (68 cases
against the Firestore emulator). Two things they cannot cover:

- **Your Firebase project's own settings.** The tests prove the website calls Firebase correctly.
  They cannot prove Email/Password is switched on, the rules are published, or your domain is
  allowed — and those are what actually break a live site.
- **How it looks.** The test environment has no layout engine, so colour contrast and spacing are
  not judged. Everything else axe can check automatically is covered by `TC-A11Y-01` to `-18`.

Work through this once after filling in `.env`, and again after any Firebase console change.
Mark each line pass or fail in the Test Cases sheet.

---

### Before you start
Fill the four `VITE_FIREBASE_*` values in `.env`, plus `VITE_OWNER_WA` (the owner's WhatsApp
number, country code first, digits only), then restart `npm run dev`. Vite reads `.env` only at
startup.

---

- [ ] **TC-MAN-01 — The settings reach the website.** Open the site. The home page loads and
      `/login` shows the real form, not the "no Firebase settings" notice.

- [ ] **TC-MAN-02 — Email and password sign-in is switched on.** Firebase console > Build >
      Authentication > Sign-in method. Email/Password is enabled. Registering without this gives
      `auth/configuration-not-found`.

- [ ] **TC-MAN-03 — The database exists and the rules are live.** Firebase console > Build >
      Firestore Database exists, and Rules matches `firestore.rules` with today's date on the
      published version. **The 68 rules tests only protect you once the rules are published.**

- [ ] **TC-MAN-04 — A real account can be created.** Register with an address you can open. The
      Verify your email screen appears and the email arrives. Check spam.

- [ ] **TC-MAN-05 — The verification link works.** Open the link, return, press
      "I've verified my email". The dashboard opens.

- [ ] **TC-MAN-06 — A password can be reset.** Login > Forgot password. The email arrives, the
      link sets a new password, and the new password logs you in.

- [ ] **TC-MAN-07 — The live domain is allowed.** Firebase console > Authentication > Settings >
      Authorized domains lists your deployed domain. Missing, and reset and verification links
      fail on the live site while working on localhost.

- [ ] **TC-MAN-08 — Owner setup works once and then closes.** Open `/admin/setup`, use the code on
      the line marked `CODE` in `firestore.rules`. The Admin page opens. Reload `/admin/setup`: it
      now says the admin account already exists.

- [ ] **TC-MAN-09 — Photos and videos upload.** In Admin > Machines, add a machine with a real
      photo and a real video. Both upload to Cloudinary and preview. Needs
      `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`, with the preset unsigned.

- [ ] **TC-MAN-10 — The public site updates live.** With the machine saved, open the site in a
      second browser. The new machine appears without a refresh.

- [ ] **TC-MAN-11 — An enquiry reaches the owner.** As a verified member, send an enquiry.
      WhatsApp opens on the owner's real number with the message filled in. Press send, confirm,
      then check the enquiry is listed in Admin > Enquiries.
      *Check the number in the WhatsApp window is yours before pressing send.* `VITE_OWNER_WA`
      was missing its country code (`9025579642`), which wa.me read as country code 90 — so this
      check would have messaged a stranger. It is now `919025579642`; this is the one step no test
      can make for you, because only you know which number is yours.

- [ ] **TC-MAN-12 — Deep links work on the deployed site.** After `npm run build` and
      `firebase deploy`, open `your-site/machines/<id>` directly in the address bar. It loads the
      machine rather than a 404 — this proves the single-page rewrite in `firebase.json` is live.

- [ ] **TC-MAN-13 — It reads well on a real screen.** Open the site at phone (375px), tablet
      (768px) and desktop width. Text is readable over the background video, nothing overlaps or
      scrolls sideways, and the menu opens and closes. This is the colour-contrast and layout
      check the automated tests cannot make.
