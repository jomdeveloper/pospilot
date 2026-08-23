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
2. Launch Electron in production mode (it will load `client/dist` instead of
   the Vite dev server, and still boot the local server automatically):
   ```bash
   npm run dev:electron
   ```
   (For a distributable `.exe`/`.dmg`/`.AppImage`, add
   [`electron-builder`](https://www.electron.build/) to `electron/package.json`
   later — not included here to keep the starter lean.)

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
