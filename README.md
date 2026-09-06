# PosPilot

A pharmacy point-of-sale app, split into three pieces:

```
pospilot/
├── client/     React (Vite) front end — the cashier screen UI
├── server/     Express API + better-sqlite3 database (products, sales)
└── electron/   Desktop shell that boots the server and loads the client
```

## How the pieces talk to each other

- **server** owns the data. It runs an Express API on `http://localhost:4000`
  backed by a local SQLite file at `server/data/pospilot.db` (created
  automatically on first run).
  - `GET /api/products?q=...` — search the catalog
  - `POST /api/sales` — checkout a cart; decrements stock and stores the sale
  - `GET /api/sales` — recent sales
- **client** is a plain React app. It calls the server over `fetch()` using
  the base URL from `window.pospilot.apiBaseUrl` (set by Electron's preload
  script) or `http://localhost:4000/api` as a fallback when you run the
  client on its own in a browser.
- **electron** is just a shell: on startup it `require()`s the server
  directly (so it shares the same `node_modules`/database) and opens a
  window pointed at the client — the Vite dev server while developing, or
  `client/dist/index.html` once built.

## First-time setup

Each folder has its own `package.json`, so install all three:

```bash
npm run install:all
```

This runs `npm install` inside `client/`, `server/`, and `electron/`, and
then rebuilds `better-sqlite3` (a native module) against **Electron's**
Node ABI — see the note below on why that matters.

Then, at the root, install the dev-only tooling used to run everything together:

```bash
npm install
```

### Why the native-module rebuild step exists

`better-sqlite3` compiles a `.node` binary for a specific Node ABI version.
Electron bundles its own Node internally, with a **different** ABI version
than your system's plain Node — so a `better-sqlite3` build that works when
you run the server with plain `node` will crash inside Electron with an
error like:

```
The module '...better_sqlite3.node' was compiled against a different
Node.js version using NODE_MODULE_VERSION 127. This version of Node.js
requires NODE_MODULE_VERSION 128.
```

Electron and system Node require different native-module builds. Desktop mode
runs the backend inside Electron, while browser mode runs it with system Node.
Two scripts flip between the builds:

```bash
npm run rebuild:electron   # build better-sqlite3 for Electron (do this before dev:desktop)
npm run rebuild:node       # build better-sqlite3 for plain Node (do this before dev, website mode)
```

`install:all` already runs `rebuild:electron` for you, so `dev:desktop`
works right after setup. If you switch to running it as a website with
`npm run dev`, run `npm run rebuild:node` first (and `rebuild:electron`
again before going back to `dev:desktop`).

## Running it as a website (browser, no Electron)

```bash
npm run dev
```

This starts the API on :4000 and the Vite dev server on :5173 together.
Open http://localhost:5173.

### Testing the camera from a phone

After installing the official `mkcert` executable, run this from the project
root:

```powershell
npm run dev:phone
```

This detects the active LAN IPv4 address, creates the certificate files in
`certs/`, configures both the Vite client and Express API for HTTPS, and starts
the app. The terminal prints the phone URL, which will look like
`https://192.168.1.50:5173`.

The phone must be connected to the same network and must trust the mkcert root
certificate. Find its location with `mkcert -CAROOT`, transfer `rootCA.pem` to
the phone, install it as a trusted certificate, and allow camera permission in
the browser. Certificate installation is a one-time manual phone step.

To start the same HTTPS setup with the Electron desktop app, run:

```powershell
npm run dev:electron
```

This generates or reuses the certificate, starts Vite and the API over HTTPS,
and launches Electron at `https://127.0.0.1:5173`. The phone uses the printed
LAN URL.

Open `https://192.168.123.35:5173` on the phone. The phone must trust the
mkcert root certificate, and the browser must be given camera permission.
Keep the certificate files private and do not commit `.certs/` to source
control. The desktop and normal HTTP development commands remain unchanged.

## Running it as a desktop app (Electron)

```bash
npm run dev:desktop
```

This starts the Vite dev server, waits for it to be ready, then launches
Electron. Electron starts the API itself with the Electron-native SQLite
module.

## Building the desktop app for real use

1. Build the client's static files:
   ```bash
   npm run build:client
   ```
2. Launch Electron in production mode (it loads `client/dist` instead of the
   Vite dev server, and boots the local server automatically):
   ```bash
   npm run dev:electron
   ```
3. Create an installer:
   ```bash
   npm run build:app
   ```

## Production checklist & behavior

- **First-run security.** The database starts with two work accounts —
  `admin / admin123` (Administrator) and `cashier / cashier123` (Cashier). On
  first login both are **forced to set their own password** (the app blocks
  everything except the change-password screen). Any account still carrying a
  default password gets the same treatment, including upgrades of older
  databases. Users added from the Users page must also change their password on
  first login.
- **Where the data lives.** In a plain-Node/browser deployment the database is
  `server/data/pospilot.db`. Inside the packaged desktop app (where the code
  sits in a read-only asar), the database and its backups automatically move to
  the per-user app-data folder instead.
- **Network exposure.** The API binds to `127.0.0.1` by default, so it is never
  reachable from the rest of the LAN. The HTTPS launchers
  (`npm run dev:electron` / `npm run dev:phone`) set `HOST=0.0.0.0` explicitly
  because they are opt-in LAN tools. Product catalogue reads require a logged-in
  session.
- **Automatic backups.** The server snapshots the SQLite database on startup
  and every 6 hours (rolling retention of the newest 20, override with
  `POSPILOT_BACKUP_KEEP`). Administrators can also create or download backups
  from **Settings → Backups**.
- **Restore.** Stop the app, then:
  ```bash
  npm run backup:list          # see available snapshots
  npm run restore:backup       # restore the newest (prompts for confirmation)
  ```
  A `pre-restore` safety copy of the current database is kept next to it before
  anything is replaced.
- **Cashier price overrides** are capped at 50% above the catalogue price by
  default (settable in **Settings**; `0` disables overrides entirely). All
  overrides are audit-logged.
- **Code signing / updates.** The Windows installer produced by `electron-builder`
  is unsigned, so SmartScreen will warn users — sign it (or document the
  warning) before wide deployment. To sign, set the `CSC_LINK` / `CSC_KEY_PASSWORD`
  environment variables (or a code-signing certificate path in `package.json`
  under `build.win.certificateFile`) and rerun `npm run build:app`; the config
  already picks these up automatically. There is no auto-update channel yet;
  ship new versions as fresh installers. Only one instance of the app may run
  at a time (single-instance lock).
- **Off-machine backups.** In **Settings → Backups** an administrator can point
  automatic snapshots at a network share, USB drive, or second disk (with a
  write test before saving). Leaving it blank keeps backups next to the
  database. `POSPILOT_BACKUP_DIR` still overrides everything for scripting.
- **Per-account brute-force lockout.** Failed logins are counted per username in
  the database (so a restart never resets them): 10 failures in 5 minutes locks
  the account for 5 minutes. Combined with the per-IP fast path, this replaces
  the old in-memory-only limiter.
- **Password policy.** Passwords must be at least 8 characters, contain a letter
  and a number, must not contain the username, and cannot reuse any of the last
  3 passwords (tracked in `password_history`).
- **Auto sign-out.** **Settings → Security & Desktop** can auto-log out an idle
  register after N minutes (0 disables). A "Sign out other sessions" button
  revokes the current account on every other terminal.
- **Launch at sign-in / kiosk.** The same Settings section can register the
  desktop app to start automatically when the Windows user signs in.
- **Log files.** Production logs (server + Electron crashes) are written to
  `%APPDATA%/pospilot/data/logs/server-YYYY-MM-DD.log` (next to the database,
  one file per day, best-effort — a logging failure never crashes the app).
- **One-command tests.** `npm test` now handles the native-module ABI dance
  itself (rebuilds `better-sqlite3` for system Node, runs the suite, then
  restores the Electron build), so it works right after `npm run install:all`.
  CI also runs `npm audit --audit-level=high` to catch vulnerable dependencies.

## Notes

- `better-sqlite3` is a native module — the first `npm install` inside
  `server/` will compile it for your OS/Node version. If that install fails,
  make sure you have the usual native build tools (Xcode command line tools
  on macOS, `build-essential`/`python3` on Linux, or the "Desktop development
  with C++" workload on Windows).
- The database file lives at `server/data/pospilot.db`.
- The cashier screen's starting cart is just illustrative — it's built from
  whatever the server returns for the selected products, so quantities and
  prices always come from the database, never hardcoded in the UI.
