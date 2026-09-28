const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  scanForSecrets,
  isPlaceholder,
  checkGitignoreProtection,
  auditEnv
} = require('../src/core/security-auditor');

test('SecurityAuditor - detects live AWS access keys', () => {
  const mockAwsKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
  const findings = scanForSecrets('AWS_ACCESS_KEY_ID', mockAwsKey);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].id, 'aws-access-key');
});

test('SecurityAuditor - detects OpenAI api keys', () => {
  const mockOpenAiKey = ['sk-proj', 'abc123456789012345678901234567890'].join('-');
  const findings = scanForSecrets('OPENAI_KEY', mockOpenAiKey);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].id, 'openai-api-key');
});

test('SecurityAuditor - detects Stripe live/test secret keys', () => {
  const mockStripeKey = ['sk', 'live', '51Abcdefghijklmnopqrstuvwx'].join('_');
  const findings = scanForSecrets('STRIPE_SECRET', mockStripeKey);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].id, 'stripe-secret-key');
});

test('SecurityAuditor - detects private key headers', () => {
  const findings = scanForSecrets('PRIVATE_KEY', '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].id, 'private-key');
});

test('SecurityAuditor - identifies dummy placeholders', () => {
  assert.strictEqual(isPlaceholder('changeme'), true);
  assert.strictEqual(isPlaceholder('your_api_key_here'), true);
  assert.strictEqual(isPlaceholder('your_secret_token_here'), true);
  assert.strictEqual(isPlaceholder('<insert_secret_key>'), true);
  assert.strictEqual(isPlaceholder('TODO'), true);
  assert.strictEqual(isPlaceholder('real-secure-production-secret-98765'), false);
});

test('SecurityAuditor - gitignore protection check', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envshield-git-test-'));
  const gitignorePath = path.join(tmpDir, '.gitignore');
  const envPath = path.join(tmpDir, '.env');

  fs.writeFileSync(gitignorePath, '.env\nnode_modules/\n', 'utf8');
  fs.writeFileSync(envPath, 'FOO=bar\n', 'utf8');

  const check = checkGitignoreProtection(envPath, tmpDir);
  assert.strictEqual(check.protected, true);

  // Unignored file test
  const envDevPath = path.join(tmpDir, '.env.dev');
  fs.writeFileSync(envDevPath, 'FOO=bar\n', 'utf8');
  const checkDev = checkGitignoreProtection(envDevPath, tmpDir);
  assert.strictEqual(checkDev.protected, false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('SecurityAuditor - auditEnv aggregates health score and findings', () => {
  const envMap = {
    PORT: '3000',
    AWS_KEY: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
    TEST_SECRET: 'changeme'
  };

  const report = auditEnv(envMap);
  assert.ok(report.healthScore < 80);
  assert.strictEqual(report.issues.length, 1); // AWS key leak
  assert.strictEqual(report.warnings.length, 1); // changeme placeholder
});
