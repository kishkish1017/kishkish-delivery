# ክሽክሽ (Kishkish)

A subscription video platform with manual receipt approval. Someone picks a
pass, pays you directly by mobile money or bank transfer, uploads a screenshot
of the receipt, and waits for you to approve it in the admin panel. Once
approved, they can sign in and watch the videos you've uploaded.

No card processor, no third-party subscription service — you review every
payment yourself.

## Requirements

- **Node.js 22.13 or newer.** This project uses Node's built-in SQLite
  (`node:sqlite`), which needs 22.13+. Check your version with `node -v`.
  It's currently marked experimental by Node, but it works well here.
- Nothing else. No database server to install, no npm packages to fetch —
  this project has zero dependencies outside Node itself.

## First-time setup

1. Copy the environment template and open it in an editor:

   ```
   cp .env.example .env
   ```

2. In `.env`, set:
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` — your login for the admin panel.
     Choose a long password (10+ characters); the server refuses to start
     without one.
   - The payment account details for whichever of Telebirr, E-Birr, CBE Birr,
     and CBE you actually accept — `TELEBIRR_NUMBER`, `TELEBIRR_NAME`, and so
     on. Subscribers see these exact values on the payment step, so double
     check them. If you leave one as `REPLACE ME`, the site still runs, but
     shows "Not set up yet" for that method and prints a startup warning —
     fine while testing, not fine once real subscribers arrive.
   - Prices, if you want something other than the defaults (150 / 400 / 1400
     Ethiopian birr for the Monthly / Three-Month / Annual passes).

   Everything else in `.env.example` has a sensible default — leave it alone
   unless you know you need it.

3. Install... nothing. There's no `npm install` step. Just run it:

   ```
   npm start
   ```

   You should see:

   ```
   ክሽክሽ is running

   Site   http://127.0.0.1:3000
   Admin  http://127.0.0.1:3000/admin
   Data   .../kishkish/data
   ```

4. Open the Site URL and confirm the packages and payment details look right.
   Open the Admin URL and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

That's it — there's no separate build step and no database migration to run;
the SQLite file is created automatically on first start, inside `data/`.

## Running it for real (not just on your own computer)

- Set `HOST=0.0.0.0` so it accepts connections from outside your machine.
- Put it behind a reverse proxy (Nginx, Caddy, etc.) that terminates HTTPS,
  and set `COOKIE_SECURE=true` and `TRUST_PROXY=true` once you do. Without
  HTTPS, session cookies and uploaded receipts travel unencrypted — don't
  run this on the open internet without it.
- Everything the app stores — the database, uploaded receipts, videos, and
  thumbnails — lives under `data/`. Back that folder up; it's the only state
  the app has.

## Day-to-day: reviewing a subscription request

1. A subscriber picks a pass, picks a payment method, sends the money
   themselves (outside the app, e.g. through the Telebirr app), and uploads
   a screenshot of the confirmation. Their account sits in "Pending Review."
2. In the admin panel's **Requests** tab, you'll see their email, the pass
   and method they chose, and a thumbnail of their receipt. Click the
   thumbnail to see it full size.
3. Click **Approve** if the payment checks out, or **Reject** if it doesn't.
   - Approving unlocks the video portal for that email immediately — the
     access period (30 / 90 / 365 days) starts from now, or, if they're
     renewing an active pass early, from whenever their current pass would
     have ended (so renewing early never costs them days).
   - Rejecting lets them try again with a new receipt without creating a
     second account.

The **Approved** and **Rejected** tabs show past decisions, in case you need
to check what happened with a particular request.

## Day-to-day: managing videos

In the admin panel's **Videos** tab:

- **Upload** a video with a title, an optional description, and an optional
  thumbnail image. You'll see a progress bar while it uploads — large files
  can take a while, so don't close the tab until it says "Processing…" has
  finished and the new video shows up in the library below.
- **Preview** opens the raw video file in a new tab so you can check it
  played back correctly, from your own admin session (this doesn't check
  subscriber access — it's just for you to confirm the upload is good).
- **Edit** changes the title, description, or thumbnail without re-uploading
  the video itself.
- **Delete** removes the video and its files permanently — there's no undo,
  and the app asks you to confirm before it does this.

Every video you upload is visible to every active subscriber; there's no
per-video access control beyond "has an active pass or not."

## Resetting a subscriber's password

There's no "forgot password" email flow (the app never sends email). If a
subscriber is locked out, reset their password yourself from the command
line:

```
npm run set-password -- someone@example.com "a new password"
```

## Troubleshooting

- **"Server refuses to start, complains about ADMIN_PASSWORD"** — it needs
  to be at least 10 characters. Set it in `.env` and restart.
- **A payment method shows "Not set up yet"** — you left its account number
  or name as `REPLACE ME` in `.env`. Fill it in and restart.
- **"SQLite is an experimental feature" warning on startup** — this is
  expected and harmless; it comes from Node itself, not this app. `npm start`
  already suppresses it from cluttering the log; you'll only see it if you
  run `node server.js` directly instead.
- **Videos won't seek / scrub properly in the player** — this usually means
  the browser can't range-request the file. The server does support HTTP
  Range requests for video streaming, so this is more likely a proxy in
  front of it stripping the `Range` header — check your reverse-proxy config
  if you're using one.

## Project layout, if you need to dig in

```
server.js              entry point — reads .env, starts the HTTP server
src/
  config.js            packages, payment methods, upload limits from .env
  security.js           password hashing, signed session cookies
  db.js                  SQLite: users, requests, videos
  http.js                minimal router, sessions, static/range file serving
  files.js               raw-body upload streaming, file-type sniffing
  routes/
    public.js           subscriber-facing API (subscribe, login, /api/me…)
    admin.js            admin-only API (approve/reject, video CRUD)
    videos.js            video listing + streaming, gated to subscribers
scripts/
  set-password.js       command-line password reset
test/
  smoke.test.js         end-to-end test suite (npm test)
public/                  the actual website (subscriber site + /admin)
data/                    created automatically — database, receipts, videos
```

Run `npm test` any time after changing backend code — it spins up a real
instance of the server and walks through the full subscribe → approve →
watch journey, plus the admin video-management flow, end to end.
