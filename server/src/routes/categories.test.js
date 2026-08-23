const test = require('node:test');
const assert = require('node:assert/strict');

const { parseProductTypeDefinitions } = require('./categories.js');

test('parses product type objects with attribute metadata from category payload', () => {
  const parsed = parseProductTypeDefinitions([
    {
      name: 'Prescription',
      description: 'Prescription products',
      attributes: [
        { name: 'Generic Name', dataType: 'text', required: true },
        { name: 'Dosage', dataType: 'text', required: false },
      ],
    },
    {
      name: 'Vitamin',
      attributes: [{ name: 'Form', dataType: 'text', required: true }],
    },
  ]);

  assert.deepEqual(parsed, [
    {
      name: 'Prescription',
      description: 'Prescription products',
      attributes: [
        { name: 'Generic Name', dataType: 'text', required: true },
        { name: 'Dosage', dataType: 'text', required: false },
      ],
    },
    {
      name: 'Vitamin',
      description: '',
      attributes: [{ name: 'Form', dataType: 'text', required: true }],
    },
  ]);
});

test('falls back to a string list when product types are sent as comma-separated text', () => {
  const parsed = parseProductTypeDefinitions('OTC, Wellness, Other');
  assert.deepEqual(parsed, [
    { name: 'OTC', description: '', attributes: [] },
    { name: 'Wellness', description: '', attributes: [] },
    { name: 'Other', description: '', attributes: [] },
  ]);
});

test('parses JSON payloads with product-specific attribute metadata', () => {
  const parsed = parseProductTypeDefinitions('[{"name":"Prescription","description":"Prescription products","attributes":[{"name":"Generic Name","dataType":"text","required":true},{"name":"Dosage","dataType":"text","required":false}]}]');
  assert.deepEqual(parsed, [
    {
      name: 'Prescription',
      description: 'Prescription products',
      attributes: [
        { name: 'Generic Name', dataType: 'text', required: true, options: [], validation: null },
        { name: 'Dosage', dataType: 'text', required: false, options: [], validation: null },
      ],
    },
  ]);
});
