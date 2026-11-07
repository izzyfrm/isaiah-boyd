import { json, fail, useDb, requireAdmin } from '../_lib.js';

// DELETE /api/sauce/comments/:id   (admin)
export async function onRequestDelete({ request, env, params }) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { db, error } = await useDb(env);
  if (error) return error;
  await db.prepare('DELETE FROM comments WHERE id = ?').bind(Number(params.id) || 0).run();
  return json({ ok: true });
}
