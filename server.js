const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.jsx':  'text/javascript; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.zip':  'application/zip',
};

// Spawn curl to proxy the request. curl's TLS fingerprint passes Cloudflare;
// Node's built-in https client does not.
function curlProxy(targetUrl, res) {
  const curl = spawn('curl', [
    '-s', '-L', '--max-time', '20', '--compressed',
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-H', 'Cache-Control: no-cache',
    targetUrl,
  ]);

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  curl.stdout.pipe(res);

  curl.on('error', (e) => {
    if (!res.headersSent) { res.writeHead(502); }
    res.end('curl error: ' + e.message);
  });
  curl.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) res.end();
  });
}

const server = http.createServer((req, res) => {
  // /proxy?url=<encoded>
  if (req.url.startsWith('/proxy?')) {
    const qs = new URL(req.url, 'http://localhost').searchParams;
    const target = qs.get('url');
    if (!target) { res.writeHead(400); res.end('Missing url param'); return; }
    let u;
    try { u = new URL(target); } catch { res.writeHead(400); res.end('Invalid url'); return; }
    if (!u.hostname.endsWith('farside.co.uk')) { res.writeHead(403); res.end('Proxy restricted to farside.co.uk'); return; }
    return curlProxy(target, res);
  }

  // Static files
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`BTC Flow Desk  →  http://localhost:${PORT}`);
});
