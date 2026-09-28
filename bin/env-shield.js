#!/usr/bin/env node

/**
 * EnvShield CLI Entry Binary
 */

const { execute } = require('../src/cli/runner');

const exitCode = execute(process.argv.slice(2));
if (typeof exitCode === 'number' && exitCode !== 0) {
  process.exit(exitCode);
}
