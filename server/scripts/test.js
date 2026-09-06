#!/usr/bin/env node
/**
 * ABI-aware test runner for the server suite.
 *
 * The server uses better-sqlite3, a native module compiled for a specific
 * Node ABI. `npm run install:all` builds it for Electron, so plain
 * `node --test` crashes with ERR_DLOPEN_FAILED. This script:
 *
 *   1. checks whether better-sqlite3 can load under the system Node,
 *   2. if not, temporarily rebuilds it for system Node,
 *   3. runs `node --test src`,
 *   4. restores the Electron ABI build when it changed something.
 *
 * Exit code mirrors the test suite, so CI can rely on `npm test`.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const serverDir = path.join(rootDir, 'server');

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return result.status === null ? 1 : result.status;
}

function betterSqliteLoadsInSystemNode() {
  try {
    const Database = require('better-sqlite3');
    const db = Database(':memory:');
    db.close();
    return true;
  } catch (_error) {
    return false;
  }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function electronVersion() {
  try {
    return require(path.join(rootDir, 'node_modules', 'electron', 'package.json')).version || null;
  } catch (_error) {
    return null;
  }
}

const originallyLoadable = betterSqliteLoadsInSystemNode();

if (!originallyLoadable) {
  console.log('\n[test] better-sqlite3 is built for Electron — rebuilding for system Node…');
  const rebuildStatus = run(npm, ['rebuild', 'better-sqlite3'], rootDir);
  if (rebuildStatus !== 0) {
    console.error(
      '\n[test] Could not rebuild better-sqlite3 for system Node.\n' +
        'Make sure no PosPilot app or server is currently running (close it, then retry).'
    );
    process.exit(rebuildStatus || 1);
  }
  if (!betterSqliteLoadsInSystemNode()) {
    console.error('\n[test] Rebuild completed but better-sqlite3 still fails to load under system Node.');
    process.exit(2);
  }
}

const testStatus = run('node', ['--test', 'src/**/*.test.js'], serverDir);

if (!originallyLoadable) {
  const version = electronVersion();
  if (version) {
    console.log('\n[test] Restoring the Electron ABI build of better-sqlite3…');

    let restoreStatus = 1;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      restoreStatus = run(
        npx,
        ['electron-rebuild', '-f', '-w', 'better-sqlite3', '--module-dir', '.', '--version', version],
        rootDir
      );

      if (restoreStatus === 0) break;
      if (attempt < 3) {
        console.warn(`\n[test] Restore attempt ${attempt} failed; retrying…`);
        const { setTimeout } = require('timers/promises');
        setTimeout(1000).catch(() => {});
      }
    }

    if (restoreStatus !== 0) {
      console.warn(
        '\n[test] Could not restore the Electron ABI build.\n' +
          'Run `npm run rebuild:electron` before `npm run dev:desktop`.'
      );
    }
  } else {
    console.warn('\n[test] Electron version not found; skipping ABI restore. Run `npm run rebuild:electron` if needed.');
  }
}

process.exit(testStatus || 0);