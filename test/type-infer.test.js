const test = require('node:test');
const assert = require('node:assert');
const {
  inferTypeFromKey,
  detectValueType,
  validateValue,
  generatePlaceholder
} = require('../src/core/type-infer');

test('TypeInfer - inferTypeFromKey identifies common conventions', () => {
  assert.strictEqual(inferTypeFromKey('PORT'), 'port');
  assert.strictEqual(inferTypeFromKey('APP_PORT'), 'port');
  assert.strictEqual(inferTypeFromKey('DATABASE_URL'), 'url');
  assert.strictEqual(inferTypeFromKey('REDIS_URI'), 'url');
  assert.strictEqual(inferTypeFromKey('CONTACT_EMAIL'), 'email');
  assert.strictEqual(inferTypeFromKey('ENABLE_SWAGGER'), 'boolean');
  assert.strictEqual(inferTypeFromKey('DEBUG'), 'boolean');
  assert.strictEqual(inferTypeFromKey('REQUEST_TIMEOUT'), 'number');
  assert.strictEqual(inferTypeFromKey('CONFIG_JSON'), 'json');
  assert.strictEqual(inferTypeFromKey('JWT_SECRET'), 'secret');
  assert.strictEqual(inferTypeFromKey('STRIPE_KEY'), 'secret');
  assert.strictEqual(inferTypeFromKey('UNKNOWN_VAR'), 'string');
});

test('TypeInfer - detectValueType identifies runtime value shapes', () => {
  assert.strictEqual(detectValueType('3000'), 'port');
  assert.strictEqual(detectValueType('999999'), 'number');
  assert.strictEqual(detectValueType('true'), 'boolean');
  assert.strictEqual(detectValueType('https://github.com'), 'url');
  assert.strictEqual(detectValueType('postgres://localhost:5432/db'), 'url');
  assert.strictEqual(detectValueType('test@example.com'), 'email');
  assert.strictEqual(detectValueType('127.0.0.1'), 'ip');
  assert.strictEqual(detectValueType('{"foo":"bar"}'), 'json');
  assert.strictEqual(detectValueType(''), 'empty');
});

test('TypeInfer - validateValue checks types correctly', () => {
  // Valid cases
  assert.strictEqual(validateValue('PORT', '3000').valid, true);
  assert.strictEqual(validateValue('DEBUG', 'true').valid, true);
  assert.strictEqual(validateValue('DEBUG', '0').valid, true);
  assert.strictEqual(validateValue('DATABASE_URL', 'https://db.example.com').valid, true);
  assert.strictEqual(validateValue('CONFIG_JSON', '{"active": true}').valid, true);

  // Invalid cases
  assert.strictEqual(validateValue('PORT', 'not-a-port').valid, false);
  assert.strictEqual(validateValue('PORT', '70000').valid, false); // > 65535
  assert.strictEqual(validateValue('DEBUG', 'not-a-boolean').valid, false);
  assert.strictEqual(validateValue('DATABASE_URL', 'not-a-url').valid, false);
  assert.strictEqual(validateValue('CONTACT_EMAIL', 'bad-email').valid, false);
  assert.strictEqual(validateValue('CONFIG_JSON', '{invalid json}').valid, false);
});

test('TypeInfer - generatePlaceholder returns intelligent defaults', () => {
  assert.strictEqual(generatePlaceholder('PORT', 'port'), '3000');
  assert.strictEqual(generatePlaceholder('DATABASE_URL', 'url'), 'postgresql://postgres:password@localhost:5432/myapp_dev');
  assert.strictEqual(generatePlaceholder('ENABLE_FEATURE', 'boolean'), 'false');
  assert.strictEqual(generatePlaceholder('API_SECRET', 'secret'), 'your_api_secret_here');
});
