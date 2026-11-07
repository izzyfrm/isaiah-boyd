// Worker entry for isaiahboyd.xyz.
// Handles /api/sauce/* and /sauce/*; everything else is served from the static site (ASSETS).
import * as me from '../functions/api/sauce/me.js';
import * as login from '../functions/api/sauce/login.js';
import * as posts from '../functions/api/sauce/posts/index.js';
import * as postByKey from '../functions/api/sauce/posts/[key].js';
import * as postComments from '../functions/api/sauce/posts/[key]/comments.js';
import * as commentById from '../functions/api/sauce/comments/[id].js';
import * as images from '../functions/api/sauce/images/index.js';
import * as imageById from '../functions/api/sauce/images/[id].js';
import * as page from '../functions/sauce/[[path]].js';

const dec = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

const routes = [
  [/^\/api\/sauce\/me$/, me, () => ({})],
  [/^\/api\/sauce\/login$/, login, () => ({})],
  [/^\/api\/sauce\/posts$/, posts, () => ({})],
  [/^\/api\/sauce\/posts\/([^/]+)$/, postByKey, (m) => ({ key: dec(m[1]) })],
  [/^\/api\/sauce\/posts\/([^/]+)\/comments$/, postComments, (m) => ({ key: dec(m[1]) })],
  [/^\/api\/sauce\/comments\/([^/]+)$/, commentById, (m) => ({ id: dec(m[1]) })],
  [/^\/api\/sauce\/images$/, images, () => ({})],
  [/^\/api\/sauce\/images\/([^/]+)$/, imageById, (m) => ({ id: dec(m[1]) })],
  [/^\/sauce(?:\/(.*))?$/, page, (m) => ({ path: (m[1] || '').split('/').filter(Boolean).map(dec) })],
];

const jsonError = (message, status) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    for (const [re, mod, getParams] of routes) {
      const m = url.pathname.match(re);
      if (!m) continue;
      const method = request.method === 'HEAD' ? 'Get' : request.method[0] + request.method.slice(1).toLowerCase();
      const handler = mod['onRequest' + method];
      const isApi = url.pathname.startsWith('/api/');
      if (!handler) return isApi ? jsonError('Method not allowed', 405) : new Response('Method not allowed', { status: 405 });
      try {
        return await handler({ request, env, params: getParams(m), waitUntil: ctx.waitUntil.bind(ctx) });
      } catch (e) {
        console.error(e);
        return isApi ? jsonError('Server error', 500) : new Response('Server error', { status: 500 });
      }
    }
    if (url.pathname.startsWith('/api/')) return jsonError('Not found', 404);
    return env.ASSETS.fetch(request);
  },
};
