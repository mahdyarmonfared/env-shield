const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { mergeEnv, syncFiles } = require('../src/core/syncer');
const { parseToMap } = require('../src/core/env-parser');

test('Syncer - mergeEnv appends missing keys from example', () => {
  const envContent = 'PORT=3000\nNODE_ENV=development';
  const exampleContent = `# Server\nPORT=8080\n# Database connection\nDATABASE_URL=postgres://localhost:5432/mydb\nAPI_KEY=your_key_here`;

  const result = mergeEnv(envContent, exampleContent);
  assert.strictEqual(result.addedKeys.length, 2);
  assert.ok(result.addedKeys.includes('DATABASE_URL'));
  assert.ok(result.addedKeys.includes('API_KEY'));

  const updatedMap = parseToMap(result.updatedContent);
  assert.strictEqual(updatedMap.PORT, '3000'); // Preserves existing value
  assert.strictEqual(updatedMap.NODE_ENV, 'development');
  assert.strictEqual(updatedMap.DATABASE_URL, 'postgres://localhost:5432/mydb');
  assert.strictEqual(updatedMap.API_KEY, 'your_key_here');
});

test('Syncer - mergeEnv does nothing when already in sync', () => {
  const envContent = 'PORT=3000\nDATABASE_URL=postgres://localhost/db';
  const exampleContent = 'PORT=3000\nDATABASE_URL=postgres://localhost/db';

  const result = mergeEnv(envContent, exampleContent);
  assert.strictEqual(result.addedKeys.length, 0);
  assert.strictEqual(result.updatedContent, envContent);
});

test('Syncer - syncFiles creates automatic backup and writes atomically', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envshield-sync-test-'));
  const envPath = path.join(tmpDir, '.env');
  const examplePath = path.join(tmpDir, '.env.example');

  fs.writeFileSync(envPath, 'PORT=3000\n', 'utf8');
  fs.writeFileSync(examplePath, 'PORT=3000\nNEW_KEY=123\n', 'utf8');

  const result = syncFiles(envPath, examplePath);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.addedKeys.length, 1);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));

  // Verify updated content on disk
  const contentOnDisk = fs.readFileSync(envPath, 'utf8');
  assert.ok(contentOnDisk.includes('PORT=3000'));
  assert.ok(contentOnDisk.includes('NEW_KEY=123'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
