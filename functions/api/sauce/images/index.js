import { json, fail, useDb, requireAdmin, now, LIMITS } from '../_lib.js';

const TYPES = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

function toBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

// POST /api/sauce/images   raw image bytes, Content-Type: image/*   (admin)
export async function onRequestPost({ request, env }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { db, error } = await useDb(env);
  if (error) return error;

  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[type]) return fail('Use a PNG, JPEG, GIF or WebP image');

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return fail('Empty file');
  if (bytes.length > LIMITS.image) return fail('Image is too large (max about 1.2 MB). It is usually shrunk automatically.', 413);
  if (!TYPES[type](bytes)) return fail('That file is not a valid image');

  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await db.prepare('INSERT INTO images (id, type, data, created_at) VALUES (?, ?, ?, ?)').bind(id, type, toBase64(bytes), now()).run();
  return json({ ok: true, id, url: `/api/sauce/images/${id}` }, 201);
}
