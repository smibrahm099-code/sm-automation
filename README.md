# SM Automation website (React + Vite + Firebase)

## 1. Firebase setup (free Spark plan)
1. Create a project at https://console.firebase.google.com
2. Build > Authentication > Get started > enable **Email/Password**.
3. Build > Firestore Database > Create database (production mode).
4. Project settings > General > add a **Web app**; copy the config values.
5. Copy `.env.example` to `.env` and fill in the values. Set `VITE_OWNER_WA` to the owner's WhatsApp number.
6. Firestore > Rules: paste the contents of `firestore.rules` and publish.
7. In Authentication > Settings > Authorized domains, add your live domain later.

## 2. Make the owner an admin (one time)
1. Publish `firestore.rules` (Firestore > Rules).
2. Open `https://your-site/admin/setup`, type the owner's email, a password and the setup code (the line marked `CODE` in `firestore.rules`).
3. You land on the Admin page. The setup closes by itself, so nobody else can become admin.
- The admin needs **no email verification**. Normal users must verify their email.
- If an admin already exists (made by hand in the console), create a document `meta/adminSetup` (any field) so setup stays closed.

## 3. Run
```
npm install
npm run dev
```

## 4. Deploy free on Firebase Hosting
```
npm install -g firebase-tools
firebase login
firebase init hosting   # public dir: dist, single-page app: yes, do not overwrite index.html
npm run build
firebase deploy
```

## Notes
- Never commit `.env`. Firebase web config is not secret, but the security rules are what protect the data.
- Replace `public/images/machine.jpg` and edit `src/data.js` with real machines.
- Enquiries are saved in Firestore, then WhatsApp opens with the message ready; the user still presses send.

## Machines, photos and videos
- All machines are listed in `src/data.js`. Copy the block to add another one.
- Photos go in `public/images/` and videos in `public/videos/`. Use the file names in `images:`, `video:` and `poster:`.
- Specifications and the description there only use what is visible on the machine. Replace them with the real ones from the client.
- Keep videos small (MP4, H.264, a few MB).

## Home page background video (fixed behind the whole page)
- File: `public/videos/hero-loop.mp4` (muted, looping, no audio) with `public/images/hero-poster.jpg` shown while it loads and when the visitor prefers reduced motion.
- To change it, replace those two files. Keep the video around 1 MB, 720p, without audio (the free Firebase Hosting plan allows about 360 MB of downloads per day).
- The dark overlay is `.herobg-shade` in `src/styles.css`; make it lighter or darker there.

## Admin: add machines, photos, videos and details
Machines are now stored in the database (Firestore) and managed from the **Admin** page (log in as the admin, open **Admin > Machines**).

1. **Publish the new rules.** Paste the contents of `firestore.rules` into Firestore > Rules and click Publish. They let everyone read machines and only admins change them.
2. **Create a free Cloudinary account** (cloudinary.com). Photos and videos are uploaded there, because Firebase Storage needs a paid plan.
   - Free plan limits: photos up to 10 MB, videos up to 100 MB, plus a monthly usage allowance (video bandwidth counts the most).
   - Copy your **Cloud name** from the dashboard.
   - Go to Settings > Upload > Upload presets > Add upload preset. Set **Signing mode: Unsigned**, give it a folder such as `sm-automation`, and save. Copy the preset name.
3. Add to `.env`: `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`, then restart `npm run dev`.
4. In Admin > Machines, click **Copy to database** once (this saves the built-in SMA 6.0 so you can edit it), then **Add machine** or **Edit**.

Notes:
- Deleting a machine or removing a photo here does not delete the file from Cloudinary. Remove it in the Cloudinary Media Library if you need the space.
- An unsigned preset can be used by anyone who finds its name in the website code. Restrict it in Cloudinary (allowed formats, folder) and keep an eye on usage.
- If the database cannot be reached, the website falls back to the built-in machine in `src/data.js`.

## How accounts work
- **Users**: Register (email is checked, then a verification link is emailed) > Log in > see the website, enquire, dashboard.
- **Admin**: logs in on the normal Login page and goes straight to the Admin page (edit machines, see enquiries). The menu shows only Admin and Log out.
- **Forgot password**: Login > Forgot password? > enter email > open the emailed link > choose a new password > Continue > Log in. Works for users and admin. In Firebase > Authentication > Settings > Authorized domains, add your live domain. The email text can be edited in Authentication > Templates.

## Email checks when registering
- Before an account is created the email is checked instantly: correct format, not a throwaway address, valid Gmail rules, a close typo of a big provider (gmil.com, gmial.com, gmail.con ...) with a "Did you mean ...?" button, and the domain must exist and be able to receive mail.
- Then the person must click the link Firebase emails them (`REQUIRE_VERIFIED = true` in `src/auth.jsx`, and `verified()` in `firestore.rules`). That is what proves the mailbox is real.
- If a real, unusual domain is wrongly flagged as a typo, the person can press "My email is correct", or add the domain to `ALLOWED` in `src/emailcheck.js`.
