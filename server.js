const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const FORM_PATH = path.join(__dirname, 'Personality Quest.html');
const ADMIN_PATH = path.join(__dirname, 'admin.html');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'responses.db'));
db.exec(`CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS responses_submitted_at ON responses(submitted_at);`);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (ADMIN_PASSWORD.length < 6) {
  console.error('ADMIN_PASSWORD must contain at least 6 characters. Copy .env.example to .env and set a password.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '8kb' }));

const COOKIE_NAME = 'pq_owner';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const sessions = new Map();
const rateLimits = new Map();
const validTypes = new Set(['ENFJ','INFJ','INTJ','ENTJ','ENFP','INFP','INTP','ENTP','ESFP','ISFP','ISTP','ESTP','ESFJ','ISFJ','ISTJ','ESTJ']);

function sameOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const host = req.get('host');
  const origin = req.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function cookieValue(req) {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : '';
}

function ownerSession(req) {
  const token = cookieValue(req);
  return token ? sessions.get(token) : null;
}

function requireOwner(req, res, next) {
  if (!ownerSession(req)) return res.status(401).json({ error: 'Sign in required' });
  next();
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

app.use((req, res, next) => {
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Invalid origin' });
  next();
});

app.get('/', (_req, res) => res.sendFile(FORM_PATH));
app.get('/owner', (_req, res) => res.sendFile(ADMIN_PATH));

app.post('/api/submissions', (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const limit = rateLimits.get(ip);
  if (limit && limit.expires > now && limit.count >= 12) return res.status(429).json({ error: 'Too many submissions. Please wait a while.' });
  rateLimits.set(ip, limit && limit.expires > now ? { count: limit.count + 1, expires: limit.expires } : { count: 1, expires: now + 15 * 60 * 1000 });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 20) : '';
  const type = typeof req.body?.type === 'string' ? req.body.type.trim().toUpperCase() : '';
  if (!validTypes.has(type)) return res.status(400).json({ error: 'Invalid personality type' });
  const submittedAt = new Date().toISOString();
  const insert = db.prepare('INSERT INTO responses (name, type, submitted_at) VALUES (?, ?, ?)');
  insert.run(name || 'Anonymous', type, submittedAt);
  res.status(201).json({ saved: true });
});

app.post('/api/admin/login', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!timingSafeEqual(password, ADMIN_PASSWORD)) return res.status(401).json({ error: 'Incorrect password' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'strict', secure: COOKIE_SECURE, maxAge: 12 * 60 * 60 * 1000, path: '/' });
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = cookieValue(req);
  sessions.delete(token);
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: COOKIE_SECURE, path: '/' });
  res.json({ authenticated: false });
});

app.get('/api/admin/responses', requireOwner, (_req, res) => {
  const rows = db.prepare('SELECT name, type, submitted_at AS submittedAt FROM responses ORDER BY id DESC').all();
  const counts = new Map();
  for (const row of rows) counts.set(row.type, (counts.get(row.type) || 0) + 1);
  const types = [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const uniqueNames = new Set(rows.map(row => row.name).filter(name => name !== 'Anonymous')).size;
  res.json({ total: rows.length, uniqueNames, types, responses: rows });
});

const server = app.listen(PORT, () => console.log(`Personality Quest is running at http://localhost:${PORT}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => db.close()));
