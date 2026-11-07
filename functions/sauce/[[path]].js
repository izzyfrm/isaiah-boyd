import { ensure } from '../api/sauce/_lib.js';

// Serves the /sauce app shell for /sauce, /sauce/<post-slug> and /sauce/write,
// and fills in the title + link-preview tags for each post so shared links look right.

const SITE = 'Isaiah B';
const DEFAULT_DESC = "Notes, updates and things I'm building.";

const plain = (md) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-\s]+/gm, '')
    .replace(/[`*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

async function loadShell(env, url) {
  let res = await env.ASSETS.fetch(new URL('/sauce-shell', url));
  for (let i = 0; i < 2 && res.status >= 300 && res.status < 400; i++) {
    res = await env.ASSETS.fetch(new URL(res.headers.get('location'), url));
  }
  return res;
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const parts = [].concat(params.path || []).filter(Boolean);
  const origin = url.origin;

  let title = `Sauce | ${SITE}`;
  let desc = DEFAULT_DESC;
  let image = `${origin}/img/og-card.png`;
  let canonical = `${origin}/sauce`;
  let status = 200;
  let noindex = false;

  if (parts.length > 1) {
    status = 404;
    noindex = true;
  } else if (parts[0] === 'write') {
    title = `Write | ${SITE}`;
    canonical = `${origin}/sauce/write`;
    noindex = true;
  } else if (parts.length === 1) {
    canonical = `${origin}/sauce/${encodeURIComponent(parts[0])}`;
    let post = null;
    if (env.DB) {
      try {
        await ensure(env.DB);
        post = await env.DB.prepare('SELECT kind, title, body FROM posts WHERE slug = ?').bind(parts[0]).first();
      } catch {
        post = null;
      }
    }
    if (post) {
      const text = plain(post.body);
      title = post.kind === 'post' && post.title ? `${post.title} | ${SITE}` : `${clip(text, 60)} | ${SITE}`;
      desc = clip(text, 200) || DEFAULT_DESC;
      const img = post.body.match(/!\[[^\]]*\]\((\/api\/sauce\/images\/[a-f0-9]{16})\)/);
      if (img) image = origin + img[1];
    } else if (env.DB) {
      status = 404;
      noindex = true;
      title = `Not found | ${SITE}`;
    }
  }

  const shell = await loadShell(env, url);
  if (!shell.ok) return new Response('Sauce page is missing from this deploy.', { status: 500 });

  const rewriter = new HTMLRewriter()
    .on('title', { element: (e) => e.setInnerContent(title) })
    .on('meta[name="description"]', { element: (e) => e.setAttribute('content', desc) })
    .on('link[rel="canonical"]', { element: (e) => e.setAttribute('href', canonical) })
    .on('meta[property="og:title"], meta[name="twitter:title"]', { element: (e) => e.setAttribute('content', title) })
    .on('meta[property="og:description"], meta[name="twitter:description"]', { element: (e) => e.setAttribute('content', desc) })
    .on('meta[property="og:url"]', { element: (e) => e.setAttribute('content', canonical) })
    .on('meta[property="og:image"], meta[name="twitter:image"]', { element: (e) => e.setAttribute('content', image) })
    .on('head', {
      element(e) {
        if (noindex) e.append('<meta name="robots" content="noindex">', { html: true });
      },
    });

  const out = new Response(shell.body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
  out.headers.set('cache-control', parts.length === 1 && status === 200 ? 'public, max-age=0, must-revalidate' : 'no-cache');
  return rewriter.transform(out);
}
