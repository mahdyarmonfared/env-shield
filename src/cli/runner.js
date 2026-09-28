/**
 * CLI command runner for EnvShield.
 */

const fs = require('fs');
const path = require('path');
const { compare } = require('../core/comparator');
const { syncFiles } = require('../core/syncer');
const { generateExampleFile } = require('../core/generator');
const { auditEnv } = require('../core/security-auditor');
const { parseToMap } = require('../core/env-parser');
const { chalk, renderTable } = require('./ansi');

function parseArgs(args) {
  const parsed = {
    command: null,
    options: {
      env: '.env',
      example: '.env.example',
      output: '.env.example',
      port: 3010,
      strict: false,
      json: false,
      dryRun: false,
      backup: true,
      help: false,
      version: false
    }
  };

  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      parsed.options.version = true;
    } else if (arg === '--strict') {
      parsed.options.strict = true;
    } else if (arg === '--json') {
      parsed.options.json = true;
    } else if (arg === '--dry-run') {
      parsed.options.dryRun = true;
    } else if (arg === '--no-backup') {
      parsed.options.backup = false;
    } else if (arg === '--ui') {
      parsed.command = 'ui';
    } else if (arg === '--env' && args[i + 1]) {
      parsed.options.env = args[++i];
    } else if (arg === '--example' && args[i + 1]) {
      parsed.options.example = args[++i];
    } else if (arg === '--out' && args[i + 1]) {
      parsed.options.output = args[++i];
    } else if (arg === '--port' && args[i + 1]) {
      parsed.options.port = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0 && !parsed.command) {
    parsed.command = positional[0];
  }

  return parsed;
}

function printHelp() {
  console.log(`
${chalk.bold(chalk.cyan('🛡️  EnvShield'))} ${chalk.dim('v1.0.0')}
${chalk.dim('Zero-dependency environment variable validator, auditor, and sync studio.')}

${chalk.bold('USAGE:')}
  ${chalk.green('envshield')} ${chalk.yellow('[command]')} ${chalk.cyan('[options]')}

${chalk.bold('COMMANDS:')}
  ${chalk.yellow('check')}             Validate .env against .env.example (default)
  ${chalk.yellow('sync')}              Sync missing variables from .env.example to .env
  ${chalk.yellow('audit')}             Deep security scan for secrets, permissions, and git exposure
  ${chalk.yellow('gen-example')}       Generate clean .env.example template from existing .env
  ${chalk.yellow('ui, studio')}        Launch interactive Web Studio on localhost:3010
  ${chalk.yellow('help')}              Show this help message

${chalk.bold('OPTIONS:')}
  ${chalk.cyan('--env <path>')}        Path to active env file (default: .env)
  ${chalk.cyan('--example <path>')}    Path to example template file (default: .env.example)
  ${chalk.cyan('--strict')}            Fail validation if extra undeclared variables exist
  ${chalk.cyan('--json')}              Output results as machine-readable JSON
  ${chalk.cyan('--dry-run')}           Simulate sync without writing changes
  ${chalk.cyan('--no-backup')}         Skip automatic backup generation during sync
  ${chalk.cyan('--port <number>')}     Port for Web Studio (default: 3010)
  ${chalk.cyan('-v, --version')}       Display version number
  ${chalk.cyan('-h, --help')}          Display this help guide

${chalk.bold('EXAMPLES:')}
  $ envshield check
  $ envshield check --strict --json
  $ envshield sync
  $ envshield audit
  $ envshield gen-example --env .env --out .env.example
  $ envshield ui --port 3010
`);
}

function runCheck(options) {
  const envPath = path.resolve(process.cwd(), options.env);
  const examplePath = path.resolve(process.cwd(), options.example);

  if (!fs.existsSync(examplePath)) {
    console.error(chalk.red(`✖ Example file not found: ${options.example}`));
    console.log(chalk.dim(`Tip: Run "envshield gen-example" to automatically create one from your .env`));
    return 1;
  }

  if (!fs.existsSync(envPath)) {
    console.error(chalk.red(`✖ Active env file not found: ${options.env}`));
    console.log(chalk.dim(`Tip: Run "envshield sync" to create it from ${options.example}`));
    return 1;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const exampleContent = fs.readFileSync(examplePath, 'utf8');

  const report = compare(envContent, exampleContent, {
    strict: options.strict,
    envPath,
    examplePath
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report.isValid ? 0 : 1;
  }

  console.log(`\n${chalk.bold(chalk.cyan('🛡️  EnvShield Check'))} ${chalk.dim(`(${options.env} vs ${options.example})`)}\n`);

  // Build Table Rows
  const headers = ['Variable', 'Status', 'Inferred Type', 'Details'];
  const rows = [];

  for (const item of report.matrix) {
    let statusText = '';
    let details = item.comment || '';

    switch (item.status) {
      case 'synced':
        statusText = chalk.green('✔ SYNCED');
        break;
      case 'missing':
        statusText = chalk.red('✖ MISSING');
        details = chalk.red('Not defined in .env');
        break;
      case 'empty':
        statusText = chalk.yellow('⚠ EMPTY');
        details = chalk.yellow('Value is blank');
        break;
      case 'placeholder':
        statusText = chalk.yellow('⚠ PLACEHOLDER');
        details = chalk.yellow(`Default dummy value: "${item.envValue}"`);
        break;
      case 'invalid_type':
        statusText = chalk.red('✖ TYPE ERROR');
        details = chalk.red(item.error || 'Invalid format');
        break;
      case 'extra':
        statusText = options.strict ? chalk.red('✖ EXTRA') : chalk.dim('ℹ EXTRA');
        details = chalk.dim('Not in .env.example');
        break;
      default:
        statusText = item.status;
    }

    rows.push([
      chalk.bold(item.key),
      statusText,
      chalk.cyan(item.inferredType),
      details
    ]);
  }

  console.log(renderTable(headers, rows));

  // Security Leaks Banner
  if (report.security.issues.length > 0) {
    console.log(`\n${chalk.bold(chalk.bgRed(' 🔒 SECURITY ALERTS DETECTED '))}`);
    for (const issue of report.security.issues) {
      console.log(`  ${chalk.red('✖')} ${chalk.bold(issue.message)}`);
    }
  }

  // Summary Metrics
  const { summary } = report;
  console.log(`\n${chalk.bold('Summary:')}`);
  console.log(`  Total Variables: ${summary.totalKeys}`);
  console.log(`  Synced:          ${chalk.green(summary.syncedCount)}`);
  if (summary.missingCount > 0) console.log(`  Missing:         ${chalk.red(summary.missingCount)} (run "envshield sync" to fix)`);
  if (summary.emptyCount > 0) console.log(`  Empty:           ${chalk.yellow(summary.emptyCount)}`);
  if (summary.placeholderCount > 0) console.log(`  Placeholders:    ${chalk.yellow(summary.placeholderCount)}`);
  if (summary.typeErrorCount > 0) console.log(`  Type Errors:     ${chalk.red(summary.typeErrorCount)}`);
  if (summary.extraCount > 0) console.log(`  Extra:           ${chalk.dim(summary.extraCount)}`);
  console.log(`  Security Score:  ${report.security.healthScore >= 80 ? chalk.green(`${report.security.healthScore}/100`) : chalk.red(`${report.security.healthScore}/100`)}\n`);

  if (!report.isValid) {
    console.log(chalk.red(`✖ Validation failed with ${summary.totalIssues} issue(s).\n`));
    return 1;
  }

  console.log(chalk.green(`✔ All environment variables are synced and valid!\n`));
  return 0;
}

function runSync(options) {
  const envPath = path.resolve(process.cwd(), options.env);
  const examplePath = path.resolve(process.cwd(), options.example);

  if (!fs.existsSync(examplePath)) {
    console.error(chalk.red(`✖ Example file not found: ${options.example}`));
    return 1;
  }

  console.log(`\n${chalk.bold(chalk.cyan('🛡️  EnvShield Sync'))}`);
  console.log(chalk.dim(`Merging missing keys from ${options.example} into ${options.env}...\n`));

  const result = syncFiles(envPath, examplePath, {
    dryRun: options.dryRun,
    backup: options.backup
  });

  if (result.addedKeys.length === 0) {
    console.log(chalk.green(`✔ .env is already in sync with ${options.example}. No keys to add.\n`));
    return 0;
  }

  console.log(chalk.green(`✔ Added ${result.addedKeys.length} new variable(s):`));
  for (const key of result.addedKeys) {
    console.log(`  ${chalk.cyan('+')} ${key}`);
  }

  if (result.backupPath) {
    console.log(`\n${chalk.dim(`📁 Backup saved to: ${path.basename(result.backupPath)}`)}`);
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`\n[DRY RUN] No files were modified on disk.`));
  } else {
    console.log(chalk.bold(chalk.green(`\n✔ Synchronization complete! Don't forget to fill real values for newly added keys.\n`)));
  }

  return 0;
}

function runAudit(options) {
  const envPath = path.resolve(process.cwd(), options.env);

  if (!fs.existsSync(envPath)) {
    console.error(chalk.red(`✖ File not found: ${options.env}`));
    return 1;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const envMap = parseToMap(content);
  const auditReport = auditEnv(envMap, envPath);

  if (options.json) {
    console.log(JSON.stringify(auditReport, null, 2));
    return auditReport.issues.length === 0 ? 0 : 1;
  }

  console.log(`\n${chalk.bold(chalk.cyan('🛡️  EnvShield Security Audit'))} ${chalk.dim(`(${options.env})`)}\n`);

  // Health Gauge
  const scoreColor = auditReport.healthScore >= 90 ? chalk.green : auditReport.healthScore >= 70 ? chalk.yellow : chalk.red;
  console.log(`Security Health Score: ${scoreColor(chalk.bold(`${auditReport.healthScore} / 100`))}\n`);

  // Git Exposure
  if (auditReport.gitProtection) {
    if (auditReport.gitProtection.protected) {
      console.log(`${chalk.green('✔ Git Protection:')} ${options.env} is properly excluded by .gitignore`);
    } else {
      console.log(`${chalk.red('✖ Git Protection:')} ${chalk.bold('CRITICAL EXPOSURE RISK!')} ${options.env} is NOT in .gitignore!`);
    }
  }

  // Permissions
  if (auditReport.permissions && !auditReport.permissions.isWindows) {
    if (auditReport.permissions.secure) {
      console.log(`${chalk.green('✔ File Permissions:')} Safe file permissions (${auditReport.permissions.mode})`);
    } else {
      console.log(`${chalk.yellow('⚠ File Permissions:')} ${auditReport.permissions.reason}`);
    }
  }

  // Issues
  if (auditReport.issues.length > 0) {
    console.log(`\n${chalk.bold(chalk.red('Vulnerabilities Found:'))}`);
    for (const issue of auditReport.issues) {
      console.log(`  ${chalk.red('✖')} [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  } else {
    console.log(`\n${chalk.green('✔ No hardcoded live secret leaks found.')}`);
  }

  // Warnings
  if (auditReport.warnings.length > 0) {
    console.log(`\n${chalk.bold(chalk.yellow('Warnings / Recommendations:'))}`);
    for (const w of auditReport.warnings) {
      console.log(`  ${chalk.yellow('⚠')} ${w.message}`);
    }
  }

  console.log('');
  return auditReport.issues.length === 0 ? 0 : 1;
}

function runGenExample(options) {
  const envPath = path.resolve(process.cwd(), options.env);
  const outPath = path.resolve(process.cwd(), options.output);

  if (!fs.existsSync(envPath)) {
    console.error(chalk.red(`✖ Source file not found: ${options.env}`));
    return 1;
  }

  console.log(`\n${chalk.bold(chalk.cyan('🛡️  EnvShield Generator'))}`);
  console.log(chalk.dim(`Creating sanitized ${options.output} from ${options.env}...`));

  generateExampleFile(envPath, outPath);

  console.log(chalk.green(`\n✔ Successfully generated ${options.output} with sanitized placeholder values!\n`));
  return 0;
}

function runUi(options) {
  const { startServer } = require('../server/server');
  startServer(options.port, {
    envPath: options.env,
    examplePath: options.example
  });
}

function execute(args = process.argv.slice(2)) {
  const { command, options } = parseArgs(args);

  if (options.version) {
    const pkg = require('../../package.json');
    console.log(`env-shield v${pkg.version}`);
    return 0;
  }

  if (options.help || command === 'help') {
    printHelp();
    return 0;
  }

  switch (command) {
    case 'check':
    case undefined:
    case null:
      return runCheck(options);

    case 'sync':
      return runSync(options);

    case 'audit':
      return runAudit(options);

    case 'gen-example':
    case 'generate':
      return runGenExample(options);

    case 'ui':
    case 'studio':
      runUi(options);
      return 0;

    default:
      console.error(chalk.red(`✖ Unknown command: ${command}`));
      printHelp();
      return 1;
  }
}

module.exports = {
  execute,
  parseArgs
};
