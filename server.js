'use strict';

/**
 * ክሽክሽ: entry point.
 *   npm start
 */

const http = require('node:http');

const config = require('./config');
require('./db'); // opens the database and creates tables
const files = require('./files');
const { HttpError, Router, json, createSession, sendStatic } = require('./http');

// ─── Startup checks ────────────────────────────────────────────────────

const problems = [];
if (!config.ADMIN_EMAIL) problems.push('ADMIN_EMAIL is empty.');
if (config.ADMIN_PASSWORD.length < 10) problems.push('ADMIN_PASSWORD must be at least 10 characters.');
if (problems.length) {
  console.error('\nክሽክሽ cannot start yet:');
  problems.forEach((p) => console.error(`  - ${p}`));
  console.error('\nCopy .env.example to .env, fill in the admin login, and run again.\n');
  process.exit(1);
}

const unsetMethods = config.methods.filter((m) => /replace me|not set up/i.test(`${m.accountNumber} ${m.accountName}`));

// ─── Routes ────────────────────────────────────────────────────────────

const router = new Router();
require('./src/routes/public').register(router);
require('./src/routes/videos').register(router);
require('./src/routes/admin').register(router);

// ─── Request handling ──────────────────────────────────────────────────

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.COOKIE_SECURE) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

/** Block state-changing requests that come from another website. */
function checkOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Request blocked.');
  }
  if (host !== req.headers.host) throw new HttpError(403, 'Request blocked.');
}

async function handle(req, res) {
  securityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (!pathname.startsWith('/api/')) return sendStatic(req, res, pathname);

  checkOrigin(req);
  const found = router.match(req.method === 'HEAD' ? 'GET' : req.method, pathname);
  if (!found) throw new HttpError(404, 'Not found.');
  if (found.pathMatched) throw new HttpError(405, 'Method not allowed.');

  const ctx = { req, res, url, params: found.params, session: createSession(req, res) };
  for (const handler of found.route.handlers) {
    await handler(ctx);
    if (res.headersSent || res.writableEnded) break;
  }
}

function fail(err, req, res) {
  if (res.writableEnded || res.destroyed) return;
  const known = err instanceof HttpError;
  if (!known) console.error(`[error] ${req.method} ${req.url}`, err);
  const status = known ? err.status : 500;
  const message = known ? err.message : 'Something went wrong on our side. Try again in a moment.';
  if (res.headersSent) return res.destroy();
  if (req.url.startsWith('/api/')) return json(res, status, { error: message });
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => fail(err, req, res));
});
server.requestTimeout = 0; // big video uploads can take a long time
server.headersTimeout = 60 * 1000;

server.listen(config.PORT, config.HOST, () => {
  const shown = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
  console.log('\n  ክሽክሽ is running\n');
  console.log(`  Site   http://${shown}:${config.PORT}`);
  console.log(`  Admin  http://${shown}:${config.PORT}/admin`);
  console.log(`  Data   ${config.DATA_DIR}\n`);
  if (unsetMethods.length) {
    console.warn(`  Heads up: payment details are not filled in for ${unsetMethods.map((m) => m.label).join(', ')}.`);
    console.warn('  Set them in .env before real subscribers use the site.\n');
  }
  if (!config.COOKIE_SECURE && config.HOST !== '127.0.0.1') {
    console.warn('  Heads up: serve this over HTTPS and set COOKIE_SECURE=true in .env.\n');
  }
});

files.startSweeper();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
