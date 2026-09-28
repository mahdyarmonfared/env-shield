/**
 * Safe, atomic synchronization of missing environment variables.
 * Preserves existing comments and creates automated backups before write.
 */

const fs = require('fs');
const path = require('path');
const { parse, parseToMap, stringify } = require('./env-parser');
const { generatePlaceholder, inferTypeFromKey } = require('./type-infer');

/**
 * Creates a backup copy of a file before making changes.
 */
function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak.${timestamp}`;

  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Synchronizes missing keys from exampleContent into envContent.
 *
 * @param {string} envContent Existing .env content
 * @param {string} exampleContent Existing .env.example content
 * @param {object} options { usePlaceholders: boolean, customValues: object }
 * @returns {object} { updatedContent, addedKeys: string[] }
 */
function mergeEnv(envContent, exampleContent, options = {}) {
  const usePlaceholders = options.usePlaceholders !== false;
  const customValues = options.customValues || {};

  const envTokens = parse(envContent || '');
  const exampleTokens = parse(exampleContent || '');

  const envMap = parseToMap(envContent || '');

  // Extract missing variables from example
  const missingTokens = [];
  const addedKeys = [];

  let currentComment = null;

  for (const token of exampleTokens) {
    if (token.type === 'comment') {
      currentComment = token.raw;
    } else if (token.type === 'variable' && token.key) {
      if (!(token.key in envMap)) {
        addedKeys.push(token.key);

        // Retain comment associated with this variable
        if (currentComment) {
          missingTokens.push({ type: 'comment', raw: currentComment });
          currentComment = null;
        }

        const inferredType = inferTypeFromKey(token.key);
        let val = '';

        if (token.key in customValues) {
          val = customValues[token.key];
        } else if (usePlaceholders) {
          // Use example token value if it's already a safe placeholder, else generate
          val = token.value || generatePlaceholder(token.key, inferredType);
        }

        missingTokens.push({
          type: 'variable',
          key: token.key,
          value: val,
          quote: token.quote || (val.includes(' ') ? '"' : null),
          comment: token.comment || null,
          exportPrefix: token.exportPrefix || false,
          raw: `${token.exportPrefix ? 'export ' : ''}${token.key}=${val}`
        });
      } else {
        currentComment = null;
      }
    } else if (token.type === 'empty') {
      currentComment = null;
    }
  }

  if (addedKeys.length === 0) {
    return {
      updatedContent: envContent,
      addedKeys: []
    };
  }

  // Append new keys under a banner comment
  const newTokens = [...envTokens];

  // If last token is not empty, add an empty line
  if (newTokens.length > 0 && newTokens[newTokens.length - 1].type !== 'empty') {
    newTokens.push({ type: 'empty', raw: '' });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  newTokens.push({
    type: 'comment',
    raw: `# --- Added by EnvShield on ${dateStr} (${addedKeys.length} new variable${addedKeys.length > 1 ? 's' : ''}) ---`
  });

  for (const token of missingTokens) {
    newTokens.push(token);
  }

  const updatedContent = stringify(newTokens);

  return {
    updatedContent,
    addedKeys
  };
}

/**
 * Performs file sync on disk with atomic write and automatic backup.
 */
function syncFiles(envPath, examplePath, options = {}) {
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const exampleContent = fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '';

  let backupPath = null;
  if (fs.existsSync(envPath) && options.backup !== false) {
    backupPath = createBackup(envPath);
  }

  const result = mergeEnv(envContent, exampleContent, options);

  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      addedKeys: result.addedKeys,
      backupPath: null
    };
  }

  // Atomic file write
  const tempPath = `${envPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, result.updatedContent, 'utf8');
  fs.renameSync(tempPath, envPath);

  return {
    success: true,
    dryRun: false,
    addedKeys: result.addedKeys,
    backupPath
  };
}

module.exports = {
  createBackup,
  mergeEnv,
  syncFiles
};
