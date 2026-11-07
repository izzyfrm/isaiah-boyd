import { json, fail, useDb, requireAdmin, readJson, cleanText, slugify, uniqueSlug, now, LIMITS } from '../_lib.js';

export const POST_COLUMNS = `p.id, p.slug, p.kind, p.title, p.body, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count`;

// GET /api/sauce/posts?limit=20&before=<id>
export async function onRequestGet({ request, env }) {
  const { db, error } = await useDb(env);
  if (error) return error;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 50);
  const before = parseInt(url.searchParams.get('before') || '0', 10) || 0;

  const rows = before
    ? await db.prepare(`SELECT ${POST_COLUMNS} FROM posts p WHERE p.id < ? ORDER BY p.id DESC LIMIT ?`).bind(before, limit + 1).all()
    : await db.prepare(`SELECT ${POST_COLUMNS} FROM posts p ORDER BY p.id DESC LIMIT ?`).bind(limit + 1).all();

  const posts = rows.results.slice(0, limit);
  return json({ posts, more: rows.results.length > limit });
}

// POST /api/sauce/posts  { kind: 'post'|'update', title, body }   (admin)
export async function onRequestPost({ request, env }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { db, error } = await useDb(env);
  if (error) return error;

  const input = await readJson(request);
  if (!input) return fail('Invalid JSON');
  const kind = input.kind === 'update' ? 'update' : 'post';
  const title = cleanText(input.title).trim();
  const body = cleanText(input.body).trim();

  if (!body) return fail('Write something first');
  if (body.length > LIMITS[kind]) return fail(`${kind === 'post' ? 'Posts' : 'Updates'} can be up to ${LIMITS[kind]} characters`);
  if (kind === 'post') {
    if (!title) return fail('Posts need a title');
    if (title.length > LIMITS.title) return fail(`Title can be up to ${LIMITS.title} characters`);
  }

  const t = now();
  const base = kind === 'post' ? slugify(title) : 'u-' + t.toString(36);
  const slug = await uniqueSlug(db, base);
  const res = await db
    .prepare('INSERT INTO posts (slug, kind, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(slug, kind, kind === 'post' ? title : '', body, t, t)
    .run();

  return json({ ok: true, id: res.meta.last_row_id, slug }, 201);
}
