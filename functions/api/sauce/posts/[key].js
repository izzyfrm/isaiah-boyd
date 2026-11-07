import { json, fail, useDb, requireAdmin, isAdmin, readJson, cleanText, now, LIMITS } from '../_lib.js';
import { POST_COLUMNS } from './index.js';

// A key is either a numeric id or a slug (slugs are never purely numeric).
const where = (key) => (/^\d+$/.test(key) ? 'p.id = ?' : 'p.slug = ?');
const bindKey = (key) => (/^\d+$/.test(key) ? Number(key) : key);

// GET /api/sauce/posts/:key  -> post + comments
export async function onRequestGet({ request, env, params }) {
  const { db, error } = await useDb(env);
  if (error) return error;
  const post = await db.prepare(`SELECT ${POST_COLUMNS} FROM posts p WHERE ${where(params.key)}`).bind(bindKey(params.key)).first();
  if (!post) return fail('Not found', 404);
  const comments = await db
    .prepare('SELECT id, name, body, is_owner, created_at FROM comments WHERE post_id = ? ORDER BY id ASC LIMIT 500')
    .bind(post.id)
    .all();
  return json({ post, comments: comments.results, admin: await isAdmin(request, env) });
}

// PUT /api/sauce/posts/:key  { title, body }   (admin)
export async function onRequestPut({ request, env, params }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { db, error } = await useDb(env);
  if (error) return error;

  const post = await db.prepare(`SELECT p.id, p.kind FROM posts p WHERE ${where(params.key)}`).bind(bindKey(params.key)).first();
  if (!post) return fail('Not found', 404);

  const input = await readJson(request);
  if (!input) return fail('Invalid JSON');
  const title = cleanText(input.title).trim();
  const body = cleanText(input.body).trim();
  if (!body) return fail('Write something first');
  if (body.length > LIMITS[post.kind]) return fail(`Too long (max ${LIMITS[post.kind]} characters)`);
  if (post.kind === 'post') {
    if (!title) return fail('Posts need a title');
    if (title.length > LIMITS.title) return fail(`Title can be up to ${LIMITS.title} characters`);
  }

  await db
    .prepare('UPDATE posts SET title = ?, body = ?, updated_at = ? WHERE id = ?')
    .bind(post.kind === 'post' ? title : '', body, now(), post.id)
    .run();
  const fresh = await db.prepare('SELECT slug FROM posts WHERE id = ?').bind(post.id).first();
  return json({ ok: true, slug: fresh.slug });
}

// DELETE /api/sauce/posts/:key   (admin)
export async function onRequestDelete({ request, env, params }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { db, error } = await useDb(env);
  if (error) return error;

  const post = await db.prepare(`SELECT p.id FROM posts p WHERE ${where(params.key)}`).bind(bindKey(params.key)).first();
  if (!post) return fail('Not found', 404);
  await db.batch([
    db.prepare('DELETE FROM comments WHERE post_id = ?').bind(post.id),
    db.prepare('DELETE FROM posts WHERE id = ?').bind(post.id),
  ]);
  return json({ ok: true });
}
