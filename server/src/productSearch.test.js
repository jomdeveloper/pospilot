const test = require('node:test');
const assert = require('node:assert/strict');

const { parseExpToSortKey } = require('./productSearch');

test('parses ISO date expiry to a month sort key', () => {
  assert.equal(parseExpToSortKey('2026-03-15'), 2026 * 12 + 3);
  assert.equal(parseExpToSortKey('2026-03'), 2026 * 12 + 3);
});

test('parses month-name expiry to the same month sort key', () => {
  assert.equal(parseExpToSortKey('MAR 2026'), 2026 * 12 + 3);
  assert.equal(parseExpToSortKey('Mar 26'), 2026 * 12 + 3);
  assert.equal(parseExpToSortKey('DEC 2026'), 2026 * 12 + 12);
});

test('is case insensitive', () => {
  assert.equal(parseExpToSortKey('mar 2026'), 2026 * 12 + 3);
});

test('rejects non-date input', () => {
  assert.equal(parseExpToSortKey(null), null);
  assert.equal(parseExpToSortKey(''), null);
  assert.equal(parseExpToSortKey('not-a-date'), null);
  assert.equal(parseExpToSortKey('2026-13'), null); // invalid month
});