import { json, fail, useDb, sameOrigin, checkPassword, sessionCookie, clearCookie, ipKey, tooMany, recordHit, readJson } from './_lib.js';

// POST /api/sauce/login  { password }
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail('Bad origin', 403);
  if (!env.ADMIN_PASSWORD) return fail('ADMIN_PASSWORD is not set in Cloudflare yet.', 503);

  const { db, error } = await useDb(env);
  if (error) return error;

  const key = 'login:' + (await ipKey(request, env));
  if (await tooMany(db, key, 5, 15 * 60)) return fail('Too many attempts. Try again in 15 minutes.', 429);

  const body = await readJson(request);
  if (!body || typeof body.password !== 'string') return fail('Password required');

  if (!(await checkPassword(env, body.password))) {
    await recordHit(db, key);
    return fail('Wrong password', 401);
  }
  const url = new URL(request.url);
  return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env, url) });
}

// DELETE /api/sauce/login  (log out)
export async function onRequestDelete({ request }) {
  if (!sameOrigin(request)) return fail('Bad origin', 403);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(new URL(request.url)) });
}
