const test = require('node:test');
const assert = require('node:assert');
const { parse, parseToMap, stringify, shouldQuote } = require('../src/core/env-parser');

test('EnvParser - basic key-value pairs', () => {
  const content = 'PORT=3000\nNODE_ENV=production\nAPP_NAME=MyApp';
  const map = parseToMap(content);
  assert.strictEqual(map.PORT, '3000');
  assert.strictEqual(map.NODE_ENV, 'production');
  assert.strictEqual(map.APP_NAME, 'MyApp');
});

test('EnvParser - handles export prefix', () => {
  const content = 'export PORT=8080\nexport API_KEY="secret-123"';
  const tokens = parse(content);
  assert.strictEqual(tokens.length, 2);
  assert.strictEqual(tokens[0].exportPrefix, true);
  assert.strictEqual(tokens[0].key, 'PORT');
  assert.strictEqual(tokens[0].value, '8080');

  const map = parseToMap(content);
  assert.strictEqual(map.PORT, '8080');
  assert.strictEqual(map.API_KEY, 'secret-123');
});

test('EnvParser - handles quotes and escape sequences', () => {
  const content = 'GREETING="Hello \\"World\\""\nSINGLE=\'Single Quoted\'';
  const map = parseToMap(content);
  assert.strictEqual(map.GREETING, 'Hello "World"');
  assert.strictEqual(map.SINGLE, 'Single Quoted');
});

test('EnvParser - handles comments and inline comments', () => {
  const content = `# Global Config\nPORT=3000 # Server port\n# Another comment\nDEBUG=true`;
  const tokens = parse(content);
  assert.strictEqual(tokens[0].type, 'comment');
  assert.strictEqual(tokens[0].comment, 'Global Config');
  assert.strictEqual(tokens[1].type, 'variable');
  assert.strictEqual(tokens[1].key, 'PORT');
  assert.strictEqual(tokens[1].value, '3000');
  assert.strictEqual(tokens[1].comment, 'Server port');
});

test('EnvParser - multiline quoted values', () => {
  const content = `PRIVATE_KEY="line1\nline2\nline3"\nOTHER=test`;
  const map = parseToMap(content);
  assert.strictEqual(map.PRIVATE_KEY, 'line1\nline2\nline3');
  assert.strictEqual(map.OTHER, 'test');
});

test('EnvParser - stringify reconstructs valid .env content', () => {
  const tokens = [
    { type: 'comment', raw: '# Config' },
    { type: 'variable', key: 'PORT', value: '3000', quote: null, comment: 'Listening port' },
    { type: 'variable', key: 'SECRET', value: 'spaced value', quote: '"' }
  ];
  const output = stringify(tokens);
  assert.ok(output.includes('# Config'));
  assert.ok(output.includes('PORT=3000 # Listening port'));
  assert.ok(output.includes('SECRET="spaced value"'));
});

test('EnvParser - shouldQuote detection', () => {
  assert.strictEqual(shouldQuote('hello world'), true);
  assert.strictEqual(shouldQuote('val#withhash'), true);
  assert.strictEqual(shouldQuote('simple_123'), false);
});
