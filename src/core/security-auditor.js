/**
 * Security Auditor for environment variables and secrets.
 * Detects hardcoded live secrets, gitignore exposure, weak placeholders, and loose file permissions.
 */

const fs = require('fs');
const path = require('path');

const SECRET_PATTERNS = [
  {
    id: 'aws-access-key',
    name: 'AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
    severity: 'critical'
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    regex: /\b(sk-(?:proj-|live-)?[a-zA-Z0-9_-]{24,})\b/,
    severity: 'critical'
  },
  {
    id: 'stripe-secret-key',
    name: 'Stripe Secret Key',
    regex: /\b((?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{24,})\b/,
    severity: 'critical'
  },
  {
    id: 'github-token',
    name: 'GitHub Personal Access Token',
    regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,})\b/,
    severity: 'critical'
  },
  {
    id: 'private-key',
    name: 'Asymmetric Private Key (RSA/EC/SSH)',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    severity: 'critical'
  },
  {
    id: 'slack-webhook',
    name: 'Slack Incoming Webhook URL',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/,
    severity: 'high'
  },
  {
    id: 'discord-webhook',
    name: 'Discord Webhook URL',
    regex: /https:\/\/(?:ptb\.|canary\.)?discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/,
    severity: 'high'
  },
  {
    id: 'jwt-token',
    name: 'JSON Web Token (JWT)',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    severity: 'medium'
  },
  {
    id: 'db-password-uri',
    name: 'Database URI with Plaintext Password',
    regex: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s@]+:([^@\s]+)@.+/,
    severity: 'medium'
  }
];

const KNOWN_PLACEHOLDERS = [
  'changeme',
  'your_api_key_here',
  'your_key_here',
  'your_secret_here',
  'your_token_here',
  'your_password_here',
  'your_value_here',
  'secret',
  'secret123',
  'password',
  'password123',
  '123456',
  'admin',
  'todo',
  'placeholder',
  'xxx',
  'test',
  'example',
  'my_secret',
  'none',
  'null',
  'undefined'
];

function isPlaceholder(value) {
  if (!value) return false;
  const clean = value.toLowerCase().replace(/['"<>]/g, '').trim();
  if (KNOWN_PLACEHOLDERS.includes(clean)) return true;
  if (/^your_.*_here$/.test(clean)) return true;
  if (/^<.*>$/.test(value.trim())) return true;
  return false;
}

function scanForSecrets(key, value) {
  if (!value || typeof value !== 'string') return [];
  const findings = [];

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(value)) {
      findings.push({
        id: pattern.id,
        name: pattern.name,
        severity: pattern.severity,
        key
      });
    }
  }

  return findings;
}

/**
 * Checks if a given env file is properly protected by .gitignore.
 */
function checkGitignoreProtection(filePath, searchDir = process.cwd()) {
  const fileName = path.basename(filePath);
  let currentDir = searchDir;
  let gitignorePath = null;

  // Search up to 5 parent directories for .gitignore
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(currentDir, '.gitignore');
    if (fs.existsSync(candidate)) {
      gitignorePath = candidate;
      break;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  if (!gitignorePath) {
    return {
      protected: false,
      gitignoreFound: false,
      gitignorePath: null,
      reason: 'No .gitignore file found in project or parent directories'
    };
  }

  try {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));

    // Check if filename is covered
    const isIgnored = lines.some(line => {
      // Clean leading slash
      const pattern = line.replace(/^\//, '');
      if (pattern === fileName) return true;
      if (pattern === '.env*' && fileName.startsWith('.env') && fileName !== '.env.example') return true;
      if (pattern === '*.env' && fileName.endsWith('.env')) return true;
      if (pattern === '.env' && fileName === '.env') return true;
      if (pattern.endsWith('/') && fileName.startsWith(pattern)) return true;
      return false;
    });

    return {
      protected: isIgnored,
      gitignoreFound: true,
      gitignorePath,
      reason: isIgnored ? 'File is explicitly ignored by .gitignore' : `File "${fileName}" is NOT ignored by .gitignore`
    };
  } catch (err) {
    return {
      protected: false,
      gitignoreFound: true,
      gitignorePath,
      reason: `Error reading .gitignore: ${err.message}`
    };
  }
}

/**
 * Checks file permissions on POSIX systems.
 */
function checkFilePermissions(filePath) {
  if (!fs.existsSync(filePath)) {
    return { secure: true, mode: null, reason: 'File does not exist' };
  }

  try {
    const stat = fs.statSync(filePath);
    // On Windows, file modes are different, skip POSIX mode check
    if (process.platform === 'win32') {
      return { secure: true, mode: stat.mode.toString(8), isWindows: true };
    }

    const mode = stat.mode & 0o777;
    // Check if group or others have read permissions (0o044)
    const tooPermissive = (mode & 0o044) !== 0;

    return {
      secure: !tooPermissive,
      mode: '0' + mode.toString(8),
      tooPermissive,
      reason: tooPermissive
        ? `Permissions (0${mode.toString(8)}) allow group/others to read sensitive variables. Run: chmod 600 ${path.basename(filePath)}`
        : 'Permissions are properly restricted to owner (0600 or equivalent)'
    };
  } catch (err) {
    return { secure: false, error: err.message };
  }
}

/**
 * Runs full security audit on a parsed map of env variables and the target file.
 */
function auditEnv(envMap, filePath) {
  const issues = [];
  const warnings = [];

  // 1. Scan values for live leaked secrets
  for (const [key, value] of Object.entries(envMap)) {
    const secretFindings = scanForSecrets(key, value);
    for (const finding of secretFindings) {
      issues.push({
        type: 'secret_leak',
        key,
        name: finding.name,
        severity: finding.severity,
        message: `Key "${key}" appears to contain a live hardcoded secret (${finding.name})`
      });
    }

    // 2. Check for suspicious placeholders
    if (isPlaceholder(value)) {
      warnings.push({
        type: 'placeholder',
        key,
        message: `Key "${key}" contains an unconfigured placeholder value: "${value}"`
      });
    }
  }

  // 3. Gitignore exposure check
  let gitCheck = null;
  if (filePath) {
    gitCheck = checkGitignoreProtection(filePath);
    if (!gitCheck.protected && path.basename(filePath) !== '.env.example') {
      issues.push({
        type: 'git_exposure',
        severity: 'critical',
        message: gitCheck.reason
      });
    }
  }

  // 4. Permissions check
  let permCheck = null;
  if (filePath) {
    permCheck = checkFilePermissions(filePath);
    if (permCheck && !permCheck.secure && permCheck.tooPermissive) {
      warnings.push({
        type: 'file_permission',
        severity: 'medium',
        message: permCheck.reason
      });
    }
  }

  // Health Score Calculation (100 is perfect)
  let healthScore = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') healthScore -= 30;
    else if (issue.severity === 'high') healthScore -= 20;
    else healthScore -= 10;
  }
  for (const _ of warnings) {
    healthScore -= 5;
  }
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    healthScore,
    issues,
    warnings,
    gitProtection: gitCheck,
    permissions: permCheck
  };
}

module.exports = {
  scanForSecrets,
  isPlaceholder,
  checkGitignoreProtection,
  checkFilePermissions,
  auditEnv,
  SECRET_PATTERNS
};
