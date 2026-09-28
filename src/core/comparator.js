/**
 * Environment variable comparator between .env and .env.example (or custom files).
 */

const { parse, parseToMap } = require('./env-parser');
const { validateValue, inferTypeFromKey } = require('./type-infer');
const { isPlaceholder, auditEnv } = require('./security-auditor');

/**
 * Compares an active environment file with a template/example file.
 *
 * @param {string} envContent Content of .env
 * @param {string} exampleContent Content of .env.example
 * @param {object} options Optional flags: { strict, envPath, examplePath }
 */
function compare(envContent, exampleContent, options = {}) {
  const envTokens = parse(envContent || '');
  const exampleTokens = parse(exampleContent || '');

  const envMap = parseToMap(envContent || '');
  const exampleMap = parseToMap(exampleContent || '');

  // Extract comments mapped to keys from example tokens
  const commentsMap = {};
  for (const token of exampleTokens) {
    if (token.type === 'variable' && token.key && token.comment) {
      commentsMap[token.key] = token.comment;
    }
  }

  const exampleKeys = Object.keys(exampleMap);
  const envKeys = Object.keys(envMap);

  const missing = [];
  const extra = [];
  const empty = [];
  const placeholders = [];
  const typeErrors = [];
  const valid = [];

  const matrix = [];

  // 1. Process all keys from example
  for (const key of exampleKeys) {
    const exampleVal = exampleMap[key];
    const inferredType = inferTypeFromKey(key);
    const comment = commentsMap[key] || null;

    if (!(key in envMap)) {
      // Key is completely missing in .env
      missing.push({ key, exampleValue: exampleVal, inferredType, comment });
      matrix.push({
        key,
        envValue: null,
        exampleValue: exampleVal,
        status: 'missing',
        inferredType,
        comment,
        badge: 'MISSING'
      });
      continue;
    }

    const envVal = envMap[key];

    // Check if value is empty
    if (envVal === '' || envVal === undefined || envVal === null) {
      empty.push({ key, exampleValue: exampleVal, inferredType, comment });
      matrix.push({
        key,
        envValue: envVal,
        exampleValue: exampleVal,
        status: 'empty',
        inferredType,
        comment,
        badge: 'EMPTY'
      });
      continue;
    }

    // Check if value is an unconfigured placeholder
    if (isPlaceholder(envVal) || (exampleVal && envVal === exampleVal && isPlaceholder(exampleVal))) {
      placeholders.push({ key, envValue: envVal, exampleValue: exampleVal, inferredType, comment });
      matrix.push({
        key,
        envValue: envVal,
        exampleValue: exampleVal,
        status: 'placeholder',
        inferredType,
        comment,
        badge: 'PLACEHOLDER'
      });
      continue;
    }

    // Type validation
    const validation = validateValue(key, envVal, inferredType);
    if (!validation.valid) {
      typeErrors.push({ key, envValue: envVal, inferredType, error: validation.error });
      matrix.push({
        key,
        envValue: envVal,
        exampleValue: exampleVal,
        status: 'invalid_type',
        inferredType,
        error: validation.error,
        comment,
        badge: 'TYPE ERROR'
      });
      continue;
    }

    // Otherwise, synced and valid!
    valid.push({ key, envValue: envVal, exampleValue: exampleVal, inferredType, comment });
    matrix.push({
      key,
      envValue: envVal,
      exampleValue: exampleVal,
      status: 'synced',
      inferredType,
      comment,
      badge: 'SYNCED'
    });
  }

  // 2. Process extra keys (defined in .env but not in example)
  for (const key of envKeys) {
    if (!(key in exampleMap)) {
      const envVal = envMap[key];
      const inferredType = inferTypeFromKey(key);
      const validation = validateValue(key, envVal, inferredType);

      extra.push({
        key,
        envValue: envVal,
        inferredType,
        valid: validation.valid,
        error: validation.error
      });

      matrix.push({
        key,
        envValue: envVal,
        exampleValue: null,
        status: 'extra',
        inferredType,
        error: validation.valid ? null : validation.error,
        comment: null,
        badge: 'EXTRA'
      });
    }
  }

  // 3. Security audit on env
  const securityReport = auditEnv(envMap, options.envPath);

  // Summary counts
  const totalIssues = missing.length + empty.length + placeholders.length + typeErrors.length + (options.strict ? extra.length : 0);
  const isValid = totalIssues === 0 && securityReport.issues.length === 0;

  return {
    isValid,
    missing,
    extra,
    empty,
    placeholders,
    typeErrors,
    valid,
    matrix,
    security: securityReport,
    summary: {
      totalKeys: matrix.length,
      exampleCount: exampleKeys.length,
      envCount: envKeys.length,
      syncedCount: valid.length,
      missingCount: missing.length,
      extraCount: extra.length,
      emptyCount: empty.length,
      placeholderCount: placeholders.length,
      typeErrorCount: typeErrors.length,
      securityIssueCount: securityReport.issues.length,
      totalIssues
    }
  };
}

module.exports = {
  compare
};
