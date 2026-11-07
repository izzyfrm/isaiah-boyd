import { json, fail, useDb, sameOrigin, isAdmin, ipKey, tooMany, recordHit, readJson, cleanText, now, LIMITS } from '../../_lib.js';

// POST /api/sauce/posts/:key/comments  { name, body, website }
// `website` is a honeypot: real visitors never see it, bots fill it in.
export async function onRequestPost({ request, env, params }) {
  if (!sameOrigin(request)) return fail('Bad origin', 403);
  const { db, error } = await useDb(env);
  if (error) return error;

  const input = await readJson(request);
  if (!input) return fail('Invalid JSON');
  if (input.website) return json({ ok: true }); // bot: pretend it worked

  const isKeyId = /^\d+$/.test(params.key);
  const post = await db
    .prepare(`SELECT id FROM posts WHERE ${isKeyId ? 'id = ?' : 'slug = ?'}`)
    .bind(isKeyId ? Number(params.key) : params.key)
    .first();
  if (!post) return fail('Post not found', 404);

  const owner = await isAdmin(request, env);
  const name = owner ? 'Isaiah' : cleanText(input.name).replace(/\s+/g, ' ').trim();
  const body = cleanText(input.body).trim();
  if (!name) return fail('Add a name');
  if (name.length > LIMITS.name) return fail(`Name can be up to ${LIMITS.name} characters`);
  if (!body) return fail('Write a comment first');
  if (body.length > LIMITS.comment) return fail(`Comments can be up to ${LIMITS.comment} characters`);

  if (!owner) {
    const ip = await ipKey(request, env);
    if ((await tooMany(db, 'c1:' + ip, 3, 60)) || (await tooMany(db, 'c2:' + ip, 15, 3600))) {
      return fail('Slow down a little and try again soon.', 429);
    }
    const count = await db.prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?').bind(post.id).first();
    if (count.c >= LIMITS.commentsPerPost) return fail('Comments are closed on this post.', 403);
    await recordHit(db, 'c1:' + ip);
    await recordHit(db, 'c2:' + ip);
  }

  const t = now();
  const res = await db
    .prepare('INSERT INTO comments (post_id, name, body, is_owner, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(post.id, name, body, owner ? 1 : 0, t)
    .run();
  return json({ ok: true, comment: { id: res.meta.last_row_id, name, body, is_owner: owner ? 1 : 0, created_at: t } }, 201);
}
