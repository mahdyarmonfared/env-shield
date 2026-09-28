/**
 * Zero-dependency HTTP server for EnvShield Web Studio.
 * Runs on localhost:3010 with built-in path traversal security and REST API.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { compare } = require('../core/comparator');
const { syncFiles, createBackup } = require('../core/syncer');
const { generateExampleContent, generateExampleFile } = require('../core/generator');
const { auditEnv } = require('../core/security-auditor');
const { parseToMap } = require('../core/env-parser');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function isPathSafe(baseDir, targetPath) {
  const resolved = path.resolve(baseDir, targetPath);
  return resolved === baseDir || resolved.startsWith(baseDir + path.sep);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store'
  });
  res.end(json);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function createServer(options = {}) {
  const projectDir = options.cwd || process.cwd();
  const uiDir = path.resolve(__dirname, '../ui');
  const envFile = options.envPath || '.env';
  const exampleFile = options.examplePath || '.env.example';

  const server = http.createServer(async (req, res) => {
    // Basic CORS & security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // --- API ROUTES ---

    if (pathname === '/api/status' && method === 'GET') {
      try {
        const envPath = path.resolve(projectDir, envFile);
        const examplePath = path.resolve(projectDir, exampleFile);

        const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        const exampleContent = fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '';

        const report = compare(envContent, exampleContent, {
          envPath,
          examplePath,
          strict: false
        });

        return sendJson(res, 200, {
          envFile,
          exampleFile,
          envExists: fs.existsSync(envPath),
          exampleExists: fs.existsSync(examplePath),
          ...report
        });
      } catch (err) {
        return sendError(res, 500, err.message);
      }
    }

    if (pathname === '/api/files' && method === 'GET') {
      try {
        const dirEntries = fs.readdirSync(projectDir);
        const envFiles = dirEntries.filter(f => {
          if (f.startsWith('.env')) return true;
          if (f.endsWith('.env')) return true;
          return false;
        });
        return sendJson(res, 200, { files: envFiles });
      } catch (err) {
        return sendError(res, 500, err.message);
      }
    }

    if (pathname === '/api/file-content' && method === 'GET') {
      try {
        const filename = parsedUrl.searchParams.get('file') || envFile;
        // Verify path traversal
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
          return sendError(res, 400, 'Invalid file name. Must be in project root.');
        }

        const filePath = path.resolve(projectDir, filename);
        if (!isPathSafe(projectDir, filePath)) {
          return sendError(res, 403, 'Access denied.');
        }

        if (!fs.existsSync(filePath)) {
          return sendJson(res, 200, { file: filename, exists: false, content: '' });
        }

        const content = fs.readFileSync(filePath, 'utf8');
        return sendJson(res, 200, { file: filename, exists: true, content });
      } catch (err) {
        return sendError(res, 500, err.message);
      }
    }

    if (pathname === '/api/save' && method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const { file, content } = body;

        if (!file || typeof file !== 'string') {
          return sendError(res, 400, 'File name is required.');
        }

        if (file.includes('/') || file.includes('\\') || file.includes('..')) {
          return sendError(res, 400, 'Invalid file name.');
        }

        const filePath = path.resolve(projectDir, file);
        if (!isPathSafe(projectDir, filePath)) {
          return sendError(res, 403, 'Access denied.');
        }

        // Automatic backup before overwrite
        let backupPath = null;
        if (fs.existsSync(filePath)) {
          backupPath = createBackup(filePath);
        }

        // Atomic write
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, content || '', 'utf8');
        fs.renameSync(tempPath, filePath);

        return sendJson(res, 200, {
          success: true,
          message: `Saved ${file} successfully`,
          backup: backupPath ? path.basename(backupPath) : null
        });
      } catch (err) {
        return sendError(res, 500, err.message);
      }
    }

    if (pathname === '/api/sync' && method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const envPath = path.resolve(projectDir, envFile);
        const examplePath = path.resolve(projectDir, exampleFile);

        if (!fs.existsSync(examplePath)) {
          return sendError(res, 404, `Example template ${exampleFile} not found.`);
        }

        const result = syncFiles(envPath, examplePath, {
          usePlaceholders: body.usePlaceholders !== false,
          customValues: body.customValues || {}
        });

        return sendJson(res, 200, {
          success: true,
          addedKeys: result.addedKeys,
          backup: result.backupPath ? path.basename(result.backupPath) : null
        });
      } catch (err) {
        return sendError(res, 500, err.message);
      }
    }

    if (pathname === '/api/gen-example' && method === 'POST') {
      try {
        const envPath = path.resolve(projectDir, envFile);
        const examplePath = path.resolve(projectDir, exampleFile);

        if (!fs.existsSync(envPath)) {
          return sendError(res, 404, `Source file ${envFile} not found.`);
        }

        const result = generateExampleFile(envPath, examplePath);
        return sendJson(res, 200, {
          success: true,
          message: `Generated ${exampleFile} successfully`,
          content: result.content
        });
      } catch (err) {
        return sendError(res, 500, err.message);
      }
    }

    if (pathname === '/api/audit' && method === 'GET') {
      try {
        const envPath = path.resolve(projectDir, envFile);
        if (!fs.existsSync(envPath)) {
          return sendError(res, 404, `File ${envFile} not found.`);
        }

        const content = fs.readFileSync(envPath, 'utf8');
        const envMap = parseToMap(content);
        const auditReport = auditEnv(envMap, envPath);

        return sendJson(res, 200, auditReport);
      } catch (err) {
        return sendError(res, 500, err.message);
      }
    }

    // --- STATIC FILES SERVING ---

    if (method === 'GET') {
      let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      const filePath = path.resolve(uiDir, relativePath);

      // Verify safe path in UI directory
      if (!isPathSafe(uiDir, filePath)) {
        return sendError(res, 403, 'Forbidden');
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // 404 fallback
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    sendError(res, 405, 'Method Not Allowed');
  });

  return server;
}

function startServer(port = 3010, options = {}) {
  const server = createServer(options);
  server.listen(port, () => {
    console.log(`\n🛡️  ${require('../cli/ansi').chalk.bold('EnvShield Web Studio')} is live at:`);
    console.log(`   ${require('../cli/ansi').chalk.cyan(`http://localhost:${port}`)}\n`);
    console.log(`   Press Ctrl+C to stop the server.\n`);
  });
  return server;
}

module.exports = {
  createServer,
  startServer
};
