/**
 * Robust, zero-dependency .env parser and serializer.
 * Supports comments, export prefixes, quoted multiline values, and inline comments.
 */

/**
 * Token types:
 * - 'variable': { type: 'variable', key, value, raw, quote, comment, exportPrefix, line }
 * - 'comment': { type: 'comment', raw, line }
 * - 'empty': { type: 'empty', raw, line }
 */

function parse(content) {
  if (typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const tokens = [];

  let inMultiline = false;
  let multilineQuote = null;
  let multilineToken = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;

    if (inMultiline) {
      // Continuing a multiline quoted string
      const closeIndex = rawLine.indexOf(multilineQuote);
      if (closeIndex !== -1 && (closeIndex === 0 || rawLine[closeIndex - 1] !== '\\')) {
        // Found ending quote
        const endPart = rawLine.slice(0, closeIndex);
        multilineToken.value += '\n' + endPart;
        multilineToken.raw += '\n' + rawLine;

        // Parse optional trailing inline comment
        const remaining = rawLine.slice(closeIndex + 1).trim();
        if (remaining.startsWith('#')) {
          multilineToken.comment = remaining.slice(1).trim();
        }

        tokens.push(multilineToken);
        inMultiline = false;
        multilineQuote = null;
        multilineToken = null;
      } else {
        // Still inside multiline
        multilineToken.value += '\n' + rawLine;
        multilineToken.raw += '\n' + rawLine;
      }
      continue;
    }

    const trimmed = rawLine.trim();

    // Empty line
    if (!trimmed) {
      tokens.push({ type: 'empty', raw: rawLine, line: lineNumber });
      continue;
    }

    // Full line comment
    if (trimmed.startsWith('#')) {
      tokens.push({
        type: 'comment',
        raw: rawLine,
        comment: trimmed.slice(1).trim(),
        line: lineNumber
      });
      continue;
    }

    // Variable line (optional "export " prefix)
    let workLine = rawLine;
    let exportPrefix = false;
    if (trimmed.startsWith('export ') || trimmed.startsWith('export\t')) {
      exportPrefix = true;
      const expIdx = rawLine.indexOf('export');
      workLine = rawLine.slice(expIdx + 6).trimStart();
    }

    const equalIndex = workLine.indexOf('=');
    if (equalIndex === -1) {
      // Line without '=', treat as comment or malformed
      tokens.push({
        type: 'comment',
        raw: rawLine,
        comment: trimmed,
        line: lineNumber,
        malformed: true
      });
      continue;
    }

    const rawKey = workLine.slice(0, equalIndex).trim();
    const rest = workLine.slice(equalIndex + 1);
    const valuePart = rest.trimStart();

    // Check if value is quoted
    const firstChar = valuePart[0];
    if (firstChar === '"' || firstChar === "'") {
      const quote = firstChar;
      const closingIndex = findClosingQuote(valuePart, quote);

      if (closingIndex !== -1) {
        // Single-line quoted value
        let val = valuePart.slice(1, closingIndex);
        if (quote === '"') {
          val = unescapeString(val);
        }

        let inlineComment = null;
        const afterQuote = valuePart.slice(closingIndex + 1).trim();
        if (afterQuote.startsWith('#')) {
          inlineComment = afterQuote.slice(1).trim();
        }

        tokens.push({
          type: 'variable',
          key: rawKey,
          value: val,
          raw: rawLine,
          quote,
          comment: inlineComment,
          exportPrefix,
          line: lineNumber
        });
      } else {
        // Multiline quoted value started!
        inMultiline = true;
        multilineQuote = quote;
        multilineToken = {
          type: 'variable',
          key: rawKey,
          value: valuePart.slice(1),
          raw: rawLine,
          quote,
          comment: null,
          exportPrefix,
          line: lineNumber
        };
      }
    } else {
      // Unquoted value
      let val = valuePart;
      let inlineComment = null;

      // Detect unquoted inline comment: `KEY=value # comment`
      const commentIdx = val.indexOf('#');
      if (commentIdx !== -1) {
        // Ensure whitespace before # for inline comment
        if (commentIdx > 0 && /\s/.test(val[commentIdx - 1])) {
          inlineComment = val.slice(commentIdx + 1).trim();
          val = val.slice(0, commentIdx).trimEnd();
        }
      } else {
        val = val.trimEnd();
      }

      tokens.push({
        type: 'variable',
        key: rawKey,
        value: val,
        raw: rawLine,
        quote: null,
        comment: inlineComment,
        exportPrefix,
        line: lineNumber
      });
    }
  }

  return tokens;
}

function findClosingQuote(str, quote) {
  for (let i = 1; i < str.length; i++) {
    if (str[i] === quote && str[i - 1] !== '\\') {
      return i;
    }
  }
  return -1;
}

function unescapeString(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function escapeString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function parseToMap(content) {
  const tokens = parse(content);
  const map = {};
  for (const token of tokens) {
    if (token.type === 'variable' && token.key) {
      map[token.key] = token.value;
    }
  }
  return map;
}

function stringify(tokens) {
  return tokens.map(token => {
    if (token.type === 'empty') return '';
    if (token.type === 'comment') return token.raw || `# ${token.comment || ''}`;
    if (token.type === 'variable') {
      const prefix = token.exportPrefix ? 'export ' : '';
      let formattedVal = token.value ?? '';
      
      // Determine quoting if not set
      if (token.quote === '"' || (token.quote === null && shouldQuote(formattedVal))) {
        formattedVal = `"${escapeString(formattedVal)}"`;
      } else if (token.quote === "'") {
        formattedVal = `'${formattedVal}'`;
      }

      let line = `${prefix}${token.key}=${formattedVal}`;
      if (token.comment) {
        line += ` # ${token.comment}`;
      }
      return line;
    }
    return token.raw || '';
  }).join('\n');
}

function shouldQuote(val) {
  if (val === '') return false;
  return /[\s#"'\\$`]/.test(val) || val.includes('\n');
}

module.exports = {
  parse,
  parseToMap,
  stringify,
  shouldQuote,
  escapeString,
  unescapeString
};
