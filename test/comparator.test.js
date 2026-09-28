const test = require('node:test');
const assert = require('node:assert');
const { compare } = require('../src/core/comparator');

test('Comparator - identifies synced variables', () => {
  const envContent = 'PORT=3000\nDATABASE_URL=https://db.local';
  const exampleContent = 'PORT=3000\nDATABASE_URL=https://db.example.com';

  const result = compare(envContent, exampleContent);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.summary.syncedCount, 2);
  assert.strictEqual(result.summary.missingCount, 0);
});

test('Comparator - identifies missing variables', () => {
  const envContent = 'PORT=3000';
  const exampleContent = 'PORT=3000\nDATABASE_URL=postgres://localhost:5432/db\nAPI_KEY=secret';

  const result = compare(envContent, exampleContent);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.summary.missingCount, 2);
  assert.strictEqual(result.missing[0].key, 'DATABASE_URL');
  assert.strictEqual(result.missing[1].key, 'API_KEY');
});

test('Comparator - identifies empty and placeholder values', () => {
  const envContent = 'PORT=3000\nDATABASE_URL=\nAPI_KEY=your_api_key_here';
  const exampleContent = 'PORT=3000\nDATABASE_URL=http://localhost\nAPI_KEY=your_api_key_here';

  const result = compare(envContent, exampleContent);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.summary.emptyCount, 1);
  assert.strictEqual(result.summary.placeholderCount, 1);
  assert.strictEqual(result.empty[0].key, 'DATABASE_URL');
  assert.strictEqual(result.placeholders[0].key, 'API_KEY');
});

test('Comparator - identifies type validation errors', () => {
  const envContent = 'PORT=invalid_port\nDEBUG=maybe';
  const exampleContent = 'PORT=3000\nDEBUG=true';

  const result = compare(envContent, exampleContent);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.summary.typeErrorCount, 2);
});

test('Comparator - strict mode fails on extra variables', () => {
  const envContent = 'PORT=3000\nUNDOCUMENTED_SECRET=123';
  const exampleContent = 'PORT=3000';

  const normalResult = compare(envContent, exampleContent, { strict: false });
  assert.strictEqual(normalResult.isValid, true);
  assert.strictEqual(normalResult.summary.extraCount, 1);

  const strictResult = compare(envContent, exampleContent, { strict: true });
  assert.strictEqual(strictResult.isValid, false);
  assert.strictEqual(strictResult.summary.extraCount, 1);
});
