// Shared helpers for the /sauce blog API (Cloudflare Pages Functions + D1).
// Bindings expected: DB (D1 database). Secret expected: ADMIN_PASSWORD.
// Optional: SESSION_SECRET (otherwise the admin password is used to sign sessions).

const enc = new TextEncoder();

export const LIMITS = {
  title: 120,
  post: 20000,
  update: 1500,
  comment: 1000,
  name: 40,
  image: 1_200_000, // bytes, after client-side compression
  commentsPerPost: 500,
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
export const fail = (message, status = 400) => json({ error: message }, status);

// ---------- schema (created on first request, safe to run every time) ----------
let ready = null;
export function ensure(db) {
  if (!ready) {
    ready = db
      .batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL DEFAULT 'post',
          title TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          body TEXT NOT NULL,
          is_owner INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL)`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, id)'),
        db.prepare(`CREATE TABLE IF NOT EXISTS images (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL)`),
        db.prepare('CREATE TABLE IF NOT EXISTS hits (key TEXT NOT NULL, ts INTEGER NOT NULL)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_hits ON hits (key, ts)'),
      ])
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

// Returns a ready DB or a Response explaining what is missing.
export async function useDb(env) {
  if (!env.DB) return { error: fail('The database is not connected yet. Add a D1 binding named DB in Cloudflare Pages settings.', 503) };
  await ensure(env.DB);
  return { db: env.DB };
}

// ---------- auth ----------
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const secretOf = (env) => env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
const COOKIE = 'sauce_s';
const SESSION_DAYS = 30;

export async function checkPassword(env, input) {
  if (!env.ADMIN_PASSWORD) return false;
  const k = secretOf(env);
  const [a, b] = await Promise.all([hmac(k, 'pw:' + String(input)), hmac(k, 'pw:' + env.ADMIN_PASSWORD)]);
  return safeEqual(a, b);
}

export async function sessionCookie(env, url) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const sig = await hmac(secretOf(env), 'sess:' + exp);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie(url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function isAdmin(request, env) {
  if (!secretOf(env) || !env.ADMIN_PASSWORD) return false;
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(secretOf(env), 'sess:' + exp));
}

// Mutating requests must come from our own pages (blocks cross-site form posts).
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export async function requireAdmin(request, env) {
  if (!sameOrigin(request)) return fail('Bad origin', 403);
  if (!(await isAdmin(request, env))) return fail('Not signed in', 401);
  return null;
}

// ---------- rate limiting ----------
export async function ipKey(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const h = await crypto.subtle.digest('SHA-256', enc.encode(ip + '|' + secretOf(env)));
  return toHex(h).slice(0, 16);
}

export async function tooMany(db, key, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.random() < 0.05) await db.prepare('DELETE FROM hits WHERE ts < ?').bind(now - 86400).run();
  const r = await db.prepare('SELECT COUNT(*) AS c FROM hits WHERE key = ? AND ts > ?').bind(key, now - windowSec).first();
  return (r?.c || 0) >= max;
}

export async function recordHit(db, key) {
  await db.prepare('INSERT INTO hits (key, ts) VALUES (?, ?)').bind(key, Math.floor(Date.now() / 1000)).run();
}

// ---------- misc ----------
export const now = () => Math.floor(Date.now() / 1000);

export function slugify(text) {
  const s = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s;
}

export async function uniqueSlug(db, base) {
  let slug = base || 'post';
  if (/^\d+$/.test(slug) || slug === 'write') slug = 'p-' + slug;
  for (let i = 0; i < 6; i++) {
    const hit = await db.prepare('SELECT 1 FROM posts WHERE slug = ?').bind(slug).first();
    if (!hit) return slug;
    slug = `${base || 'post'}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base || 'post'}-${Date.now().toString(36)}`;
}

export const cleanText = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n');

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
