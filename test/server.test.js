const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createServer } = require('../src/server/server');

function makeRequest(server, method, reqPath, body = null) {
  const addr = server.address();
  const port = addr.port;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {}
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, raw: data, json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

test('Server - API endpoints and security', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envshield-server-test-'));
  const envPath = path.join(tmpDir, '.env');
  const examplePath = path.join(tmpDir, '.env.example');

  fs.writeFileSync(envPath, 'PORT=3000\nSECRET_KEY=123456789\n', 'utf8');
  fs.writeFileSync(examplePath, 'PORT=3000\nSECRET_KEY=your_key_here\nAPI_URL=https://api.com\n', 'utf8');

  const server = createServer({ cwd: tmpDir });
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // 1. GET /api/status
    const statusRes = await makeRequest(server, 'GET', '/api/status');
    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.json.summary.totalKeys, 3);
    assert.strictEqual(statusRes.json.summary.missingCount, 1);

    // 2. GET /api/files
    const filesRes = await makeRequest(server, 'GET', '/api/files');
    assert.strictEqual(filesRes.statusCode, 200);
    assert.ok(filesRes.json.files.includes('.env'));
    assert.ok(filesRes.json.files.includes('.env.example'));

    // 3. GET /api/file-content (safe)
    const contentRes = await makeRequest(server, 'GET', '/api/file-content?file=.env');
    assert.strictEqual(contentRes.statusCode, 200);
    assert.ok(contentRes.json.content.includes('PORT=3000'));

    // 4. Path traversal protection on /api/file-content
    const traversalRes = await makeRequest(server, 'GET', '/api/file-content?file=../../etc/passwd');
    assert.strictEqual(traversalRes.statusCode, 400);

    // 5. POST /api/save
    const saveRes = await makeRequest(server, 'POST', '/api/save', {
      file: '.env',
      content: 'PORT=8080\nNEW_VAR=hello\n'
    });
    assert.strictEqual(saveRes.statusCode, 200);
    assert.strictEqual(saveRes.json.success, true);

    const savedContent = fs.readFileSync(envPath, 'utf8');
    assert.ok(savedContent.includes('PORT=8080'));

    // 6. POST /api/sync
    const syncRes = await makeRequest(server, 'POST', '/api/sync', { usePlaceholders: true });
    assert.strictEqual(syncRes.statusCode, 200);
    assert.strictEqual(syncRes.json.success, true);
    assert.ok(syncRes.json.addedKeys.includes('API_URL'));

    // 7. Static HTML serving
    const htmlRes = await makeRequest(server, 'GET', '/');
    assert.strictEqual(htmlRes.statusCode, 200);
    assert.ok(htmlRes.raw.includes('EnvShield Studio'));

    // 8. Static CSS serving
    const cssRes = await makeRequest(server, 'GET', '/style.css');
    assert.strictEqual(cssRes.statusCode, 200);
    assert.ok(cssRes.raw.includes('--bg-primary'));

    // 9. Static JS serving
    const jsRes = await makeRequest(server, 'GET', '/app.js');
    assert.strictEqual(jsRes.statusCode, 200);
    assert.ok(jsRes.raw.includes('EnvShield Web Studio'));

  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
