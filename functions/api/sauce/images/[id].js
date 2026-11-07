import { fail, useDb } from '../_lib.js';

// GET /api/sauce/images/:id
export async function onRequestGet({ env, params }) {
  const { db, error } = await useDb(env);
  if (error) return error;
  if (!/^[a-f0-9]{16}$/.test(params.id)) return fail('Not found', 404);
  const row = await db.prepare('SELECT type, data FROM images WHERE id = ?').bind(params.id).first();
  if (!row) return fail('Not found', 404);
  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      'content-type': row.type,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
