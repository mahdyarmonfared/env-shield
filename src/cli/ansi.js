/**
 * Zero-dependency ANSI formatting and table rendering utility.
 */

const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgGray: '\x1b[100m'
};

function c(name, text) {
  if (!isColorSupported || !colors[name]) return text;
  return `${colors[name]}${text}${colors.reset}`;
}

const chalk = {
  bold: (t) => c('bold', t),
  dim: (t) => c('dim', t),
  italic: (t) => c('italic', t),
  underline: (t) => c('underline', t),
  red: (t) => c('red', t),
  green: (t) => c('green', t),
  yellow: (t) => c('yellow', t),
  blue: (t) => c('blue', t),
  magenta: (t) => c('magenta', t),
  cyan: (t) => c('cyan', t),
  white: (t) => c('white', t),
  gray: (t) => c('gray', t),
  bgRed: (t) => c('bgRed', t),
  bgGreen: (t) => c('bgGreen', t),
  bgYellow: (t) => c('bgYellow', t),
  bgCyan: (t) => c('bgCyan', t)
};

function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function padRight(str, len) {
  const visibleLen = stripAnsi(str).length;
  if (visibleLen >= len) return str;
  return str + ' '.repeat(len - visibleLen);
}

function padLeft(str, len) {
  const visibleLen = stripAnsi(str).length;
  if (visibleLen >= len) return str;
  return ' '.repeat(len - visibleLen) + str;
}

/**
 * Renders a clean ASCII table with auto-adjusting column widths.
 */
function renderTable(headers, rows, options = {}) {
  const colWidths = headers.map((h, i) => {
    let max = stripAnsi(h).length;
    for (const row of rows) {
      const cell = row[i] !== undefined && row[i] !== null ? String(row[i]) : '';
      const len = stripAnsi(cell).length;
      if (len > max) max = len;
    }
    return max;
  });

  const sep = colWidths.map(w => '─'.repeat(w + 2)).join('┼');
  const top = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const mid = '├' + sep + '┤';
  const bot = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

  const headerRow = '│ ' + headers.map((h, i) => chalk.bold(padRight(h, colWidths[i]))).join(' │ ') + ' │';

  const contentRows = rows.map(row => {
    return '│ ' + row.map((cell, i) => {
      const val = cell !== undefined && cell !== null ? String(cell) : '';
      return padRight(val, colWidths[i]);
    }).join(' │ ') + ' │';
  });

  return [top, headerRow, mid, ...contentRows, bot].join('\n');
}

module.exports = {
  c,
  chalk,
  stripAnsi,
  padRight,
  padLeft,
  renderTable
};
