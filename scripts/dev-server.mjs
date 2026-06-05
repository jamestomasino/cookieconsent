import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function safeResolve(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(root, normalized);
  return fullPath.startsWith(root) ? fullPath : null;
}

async function readFileForRequest(requestPath) {
  let candidate = safeResolve(requestPath);
  if (!candidate) return null;

  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
    }
    const file = await fs.readFile(candidate);
    return { file, candidate };
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new url.URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const fileResult = await readFileForRequest(pathname);

  if (!fileResult) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(fileResult.candidate).toLowerCase();
  const contentType = contentTypes.get(ext) || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store'
  });
  res.end(fileResult.file);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`dev server running at http://127.0.0.1:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
