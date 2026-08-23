const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveProductImageUrl } = require('./products.js');

test('returns no image when no upload is provided', () => {
  const image = resolveProductImageUrl({ category: 'Medicine', imageUrl: '' });
  assert.equal(image, null);
});

test('prefers the uploaded image over the category default', () => {
  const image = resolveProductImageUrl({ category: 'Beauty', imageUrl: 'https://example.com/uploaded.png' }, 'Beauty');
  assert.equal(image, 'https://example.com/uploaded.png');
});
