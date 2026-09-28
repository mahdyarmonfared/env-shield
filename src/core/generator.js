/**
 * Generator for .env.example templates from existing .env files.
 * Sanitizes all actual values and replaces them with safe, standard placeholders.
 */

const fs = require('fs');
const { parse, stringify } = require('./env-parser');
const { generatePlaceholder, inferTypeFromKey } = require('./type-infer');

function generateExampleContent(envContent, options = {}) {
  const tokens = parse(envContent || '');
  const exampleTokens = [];

  for (const token of tokens) {
    if (token.type === 'comment' || token.type === 'empty') {
      exampleTokens.push(token);
      continue;
    }

    if (token.type === 'variable' && token.key) {
      const inferredType = inferTypeFromKey(token.key);
      const placeholder = generatePlaceholder(token.key, inferredType);

      exampleTokens.push({
        type: 'variable',
        key: token.key,
        value: placeholder,
        quote: null,
        comment: token.comment || (inferredType !== 'string' ? `Type: ${inferredType}` : null),
        exportPrefix: token.exportPrefix || false,
        raw: `${token.exportPrefix ? 'export ' : ''}${token.key}=${placeholder}`
      });
    }
  }

  return stringify(exampleTokens);
}

function generateExampleFile(envPath, outputPath, options = {}) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Source file not found: ${envPath}`);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const exampleContent = generateExampleContent(content, options);

  fs.writeFileSync(outputPath, exampleContent, 'utf8');
  return {
    outputPath,
    content: exampleContent
  };
}

module.exports = {
  generateExampleContent,
  generateExampleFile
};
