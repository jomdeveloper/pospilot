const express = require('express');
const db = require('../db');
const { authenticate } = require('./auth');

const router = express.Router();

/** Slice of settings that are safe to send to any authenticated client.
 * MUST mirror the client's DEFAULT_STORE_SETTINGS so every key is persisted
 * and returned — the PUT merge loop is driven entirely by these keys (a key
 * missing here was silently dropped, which is why store logos never saved). */
const DEFAULTS = {
  storeName: "St. Isidore's Pharmacy",
  logoUrl: "",
  address: '',
  phone: '',
  email: '',
  tinNumber: '',
  ownerName: '',
  businessName: '',
  branchName: '',
  branchCode: '',
  businessRegNumber: '',
  dtiSecRegNumber: '',
  birRegNumber: '',
  website: '',
  facebook: '',
  tagline: '',
  authorizedRep: '',
  cashierManagerContact: '',
  receiptFooter: 'Thank you for shopping with us.',
  taxRate: '0',
  defaultLocation: 'Main Store',
  lowStockThreshold: '10',
  terminalName: 'POS-02',
  // How much a cashier may raise a unit price above the catalog price (in %).
  // Any override beyond this is rejected with a 403. 0 disables overrides.
  priceOverrideMaxPct: '50',
  // Where automatic database backups go. Empty = next to the database
  // (`server/data/backups` in dev, `%APPDATA%/pospilot/data/backups` packaged).
  // Can point at a network share or second drive for off-machine redundancy.
  backupDir: '',
  // Minutes of inactivity before the app auto-logs out. 0 = disabled.
  idleTimeoutMinutes: '0',
  // Desktop-only: launch the app when the operator signs in to Windows.
  launchOnStartup: 'false',
};

function getSettings() {
  return { ...DEFAULTS, ...readSettingsRow() };
}

function readSettingsRow() {
  const row = db.prepare('SELECT data_json FROM app_settings WHERE id = 1').get();
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.data_json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// GET /api/settings — store configuration (store name, address, TIN, footer…)
router.get('/', authenticate, (req, res) => {
  res.json({ ...DEFAULTS, ...readSettingsRow() });
});

// PUT /api/settings — persist store configuration to the database
router.put('/', authenticate, (req, res) => {
  const body = req.body || {};
  const current = readSettingsRow();
  const merged = {};

  // Copy over every known key from the incoming object, and keep the rest of
  // the defaults so a partial update never wipes other fields.
  for (const key of Object.keys(DEFAULTS)) {
    if (body[key] !== undefined && body[key] !== null) {
      merged[key] = String(body[key]);
    } else if (current[key] !== undefined) {
      merged[key] = String(current[key]);
    } else {
      merged[key] = DEFAULTS[key];
    }
  }

  db.prepare(
    `INSERT INTO app_settings (id, data_json, updated_at)
     VALUES (1, ?, datetime('now', 'localtime'))
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(merged));

  res.json({ ok: true, settings: merged });
});

module.exports = router;
module.exports.getSettings = getSettings;