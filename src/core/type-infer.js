/**
 * Type inference and value validation for environment variables.
 */

const URL_PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.+/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

function inferTypeFromKey(key) {
  const upper = (key || '').toUpperCase();

  if (upper.endsWith('_PORT') || upper === 'PORT') return 'port';
  if (upper.endsWith('_URL') || upper.endsWith('_URI') || upper.startsWith('URL_') || upper.includes('_ENDPOINT')) return 'url';
  if (upper.endsWith('_EMAIL') || upper.startsWith('EMAIL_') || upper === 'EMAIL') return 'email';
  if (
    upper.startsWith('ENABLE_') ||
    upper.startsWith('DISABLE_') ||
    upper.startsWith('IS_') ||
    upper.startsWith('HAS_') ||
    upper.endsWith('_ENABLED') ||
    upper === 'DEBUG' ||
    upper === 'VERBOSE'
  ) return 'boolean';
  if (
    upper.endsWith('_TIMEOUT') ||
    upper.endsWith('_LIMIT') ||
    upper.endsWith('_COUNT') ||
    upper.endsWith('_MAX') ||
    upper.endsWith('_MIN') ||
    upper.endsWith('_TTL') ||
    upper.endsWith('_SIZE') ||
    upper.endsWith('_RETRIES')
  ) return 'number';
  if (upper.endsWith('_JSON') || upper.startsWith('JSON_')) return 'json';
  if (
    upper.endsWith('_SECRET') ||
    upper.endsWith('_KEY') ||
    upper.endsWith('_TOKEN') ||
    upper.endsWith('_PASSWORD') ||
    upper.endsWith('_PASSPHRASE') ||
    upper.endsWith('_SALT')
  ) return 'secret';

  return 'string';
}

function detectValueType(value) {
  if (value === undefined || value === null || value === '') return 'empty';
  const trimmed = value.trim();

  // Boolean check
  if (['true', 'false', '0', '1', 'yes', 'no'].includes(trimmed.toLowerCase())) {
    return 'boolean';
  }

  // Integer / Port check
  if (/^-?\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= 65535) return 'port';
    return 'number';
  }

  // Float check
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return 'number';
  }

  // URL check
  if (URL_PROTOCOL_REGEX.test(trimmed)) {
    return 'url';
  }

  // Email check
  if (EMAIL_REGEX.test(trimmed)) {
    return 'email';
  }

  // IPv4 check
  if (IPV4_REGEX.test(trimmed)) {
    return 'ip';
  }

  // JSON check
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // not valid json
    }
  }

  return 'string';
}

function validateValue(key, value, expectedType) {
  const type = expectedType || inferTypeFromKey(key);

  if (value === undefined || value === null || value === '') {
    return {
      valid: false,
      type,
      empty: true,
      error: 'Value is empty'
    };
  }

  const trimmed = value.trim();

  switch (type) {
    case 'port': {
      const num = Number(trimmed);
      if (!Number.isInteger(num) || num < 1 || num > 65535) {
        return { valid: false, type, error: `Invalid port number: "${trimmed}" (must be 1-65535)` };
      }
      return { valid: true, type };
    }

    case 'number': {
      const num = Number(trimmed);
      if (isNaN(num)) {
        return { valid: false, type, error: `Value "${trimmed}" is not a valid number` };
      }
      return { valid: true, type };
    }

    case 'boolean': {
      if (!['true', 'false', '0', '1', 'yes', 'no'].includes(trimmed.toLowerCase())) {
        return { valid: false, type, error: `Invalid boolean: "${trimmed}" (expected true/false/1/0)` };
      }
      return { valid: true, type };
    }

    case 'url': {
      if (!URL_PROTOCOL_REGEX.test(trimmed)) {
        return { valid: false, type, error: `Invalid URL format: "${trimmed}"` };
      }
      return { valid: true, type };
    }

    case 'email': {
      if (!EMAIL_REGEX.test(trimmed)) {
        return { valid: false, type, error: `Invalid email address: "${trimmed}"` };
      }
      return { valid: true, type };
    }

    case 'json': {
      try {
        JSON.parse(trimmed);
        return { valid: true, type };
      } catch (err) {
        return { valid: false, type, error: `Malformed JSON: ${err.message}` };
      }
    }

    case 'secret': {
      // We don't fail secrets on type, but can check length
      if (trimmed.length < 8) {
        return { valid: true, type, warning: 'Secret is short (< 8 characters)' };
      }
      return { valid: true, type };
    }

    default:
      return { valid: true, type: 'string' };
  }
}

function generatePlaceholder(key, inferredType) {
  const type = inferredType || inferTypeFromKey(key);
  const upper = key.toUpperCase();

  if (type === 'port') {
    if (upper.includes('REDIS')) return '6379';
    if (upper.includes('POSTGRES') || upper.includes('PG')) return '5432';
    if (upper.includes('MONGO')) return '27017';
    if (upper.includes('MYSQL')) return '3306';
    return '3000';
  }

  if (type === 'url') {
    if (upper.includes('MONGO')) return 'mongodb://localhost:27017/myapp_dev';
    if (upper.includes('POSTGRES') || upper.includes('PG') || upper.includes('DATABASE')) return 'postgresql://postgres:password@localhost:5432/myapp_dev';
    if (upper.includes('REDIS')) return 'redis://localhost:6379';
    if (upper.includes('FRONTEND') || upper.includes('APP_URL')) return 'http://localhost:3000';
    if (upper.includes('API')) return 'http://localhost:8080/api';
    return 'https://example.com';
  }

  if (type === 'email') return 'admin@example.com';
  if (type === 'boolean') return 'false';
  if (type === 'number') {
    if (upper.includes('TIMEOUT') || upper.includes('TTL')) return '5000';
    if (upper.includes('RETRIES')) return '3';
    return '100';
  }
  if (type === 'json') return '{"key": "value"}';
  if (type === 'secret') return `your_${key.toLowerCase()}_here`;

  return `your_${key.toLowerCase()}_here`;
}

module.exports = {
  inferTypeFromKey,
  detectValueType,
  validateValue,
  generatePlaceholder
};
