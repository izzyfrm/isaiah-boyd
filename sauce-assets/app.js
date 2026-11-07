(() => {
  'use strict';

  const app = document.getElementById('app');
  const API = '/api/sauce';
  const AV = '/avatar.png';
  const SITE = 'Isaiah B';
  const LIM = { post: 20000, update: 1500, comment: 1000, title: 120, name: 40 };
  let me = { admin: false, configured: true, db: true };
  let token = 0;

  // ---------- tiny helpers ----------
  const $ = (s, r = app) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ic = {
    left: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
    chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12Z"/>'),
    img: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.5-4.5L6 21"/>'),
    link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
    quote: svg('<path d="M4 6h6v6H4zM14 6h6v6h-6z"/><path d="M4 12c0 3 1 5 4 6M14 12c0 3 1 5 4 6"/>'),
    code: svg('<path d="m8 8-5 4 5 4M16 8l5 4-5 4"/>'),
    list: svg('<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>'),
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  };

  async function api(path, { json, ...opts } = {}) {
    const o = { method: 'GET', headers: {}, credentials: 'same-origin', ...opts };
    if (json !== undefined) {
      o.body = JSON.stringify(json);
      o.headers['Content-Type'] = 'application/json';
    }
    if (o.method !== 'GET') o.headers['X-Sauce'] = '1';
    const res = await fetch(API + path, o);
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    if (!res.ok) {
      const e = new Error(data?.error || `Request failed (${res.status})`);
      e.status = res.status;
      e.backend = data !== null;
      throw e;
    }
    return data;
  }

  function when(ts) {
    const d = new Date(ts * 1000);
    const s = (Date.now() - d) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  }
  const fullDate = (ts) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ---------- markdown (everything is escaped first; only a small safe set of tags is produced) ----------
  const safeUrl = (u) => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(u.trim()) ? u.trim() : null);

  function inline(raw) {
    const stash = [];
    const put = (h) => '\u0001' + (stash.push(h) - 1) + '\u0001';
    const emph = (t) =>
      t
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, '$1<em>$2</em>');
    const a = (url, text) => `<a href="${url}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>${text}</a>`;

    let s = raw.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`));
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => {
      const url = safeUrl(u);
      return url ? put(`<img src="${url}" alt="${alt}" loading="lazy">`) : m;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      const url = safeUrl(u);
      return url ? put(a(url, emph(t))) : m;
    });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<\u0001]*[^\s<.,;:!?)\u0001])/g, (m, pre, u) => pre + put(a(u, u)));
    s = emph(s);
    for (let i = 0; i < 3; i++) s = s.replace(/\u0001(\d+)\u0001/g, (_, n) => stash[+n]);
    return s;
  }

  function md(src) {
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const blockStart = (l) => /^(#{1,3}\s|>\s?|```|[-*]\s+|\d+\.\s+|---+\s*$)/.test(l);
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if (/^```/.test(l)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      } else if ((m = l.match(/^(#{1,3})\s+(.*)$/))) {
        const n = m[1].length + 1;
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
        i++;
      } else if (/^---+\s*$/.test(l)) {
        out.push('<hr>');
        i++;
      } else if (/^>\s?/.test(l)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      } else if (/^[-*]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ''));
        out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
      } else if (/^\d+\.\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ''));
        out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`);
      } else {
        const buf = [l];
        i++;
        while (i < lines.length && lines[i].trim() && !blockStart(lines[i])) buf.push(lines[i++]);
        out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
      }
    }
    return out.join('');
  }

  const plain = (s) =>
    s
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^[#>\-\s]+/gm, '')
      .replace(/[`*_~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const firstImage = (s) => (s.match(/!\[[^\]]*\]\((\/api\/sauce\/images\/[a-f0-9]{16})\)/) || [])[1];

  // ---------- shared chrome ----------
  const setTitle = (t) => { document.title = t ? `${t} | ${SITE}` : `Sauce | ${SITE}`; };
  const shell = (inner) => `<div class="wrap">${inner}</div>`;
  const topbar = () => `
    <div class="top">
      <a class="pill" href="/">${ic.left} isaiahboyd.xyz</a>
      <div class="right">
        ${me.admin ? `<a class="pill" href="/sauce/write">Write</a><button class="pill" data-act="logout">Log out</button>` : ''}
      </div>
    </div>`;
  const render = (inner) => { app.innerHTML = shell(inner); };

  function problem(e) {
    if (e.status === 503) {
      return `<div class="card fade"><div class="empty"><b>Almost there</b>${esc(e.message)}</div></div>`;
    }
    if (!e.backend) {
      return `<div class="card fade"><div class="empty"><b>The blog backend isn't connected yet</b>The page is live, but the Cloudflare Functions that store posts haven't been deployed on this site.</div></div>`;
    }
    return `<div class="card fade"><div class="empty"><b>Something went wrong</b>${esc(e.message)}</div></div>`;
  }

  // ---------- feed ----------
  function cardHTML(p) {
    const href = `/sauce/${encodeURIComponent(p.slug)}`;
    const cc = `<a href="${href}#comments">${ic.chat}${p.comment_count} ${p.comment_count === 1 ? 'comment' : 'comments'}</a>`;
    if (p.kind === 'update') {
      return `<article class="card link fade" data-href="${href}">
        <div class="byline"><img class="av" src="${AV}" alt=""><div><b>Isaiah B</b><small><a href="${href}">${when(p.created_at)}</a></small></div></div>
        <div class="prose">${md(p.body)}</div>
        <div class="foot">${cc}</div></article>`;
    }
    const img = firstImage(p.body);
    return `<article class="card link fade" data-href="${href}">
      <span class="mono">Post · ${fullDate(p.created_at)}</span>
      <h2><a href="${href}">${esc(p.title)}</a></h2>
      <p class="excerpt">${esc(clip(plain(p.body), 220))}</p>
      ${img ? `<img class="thumb" src="${img}" alt="" loading="lazy">` : ''}
      <div class="foot"><a href="${href}">Read post →</a>${cc}</div></article>`;
  }

  async function feed() {
    const my = ++token;
    setTitle();
    render(`${topbar()}
      <header class="hero"><span class="mono">Blog</span><h1>Sauce</h1><p>Notes, updates and things I'm building.</p></header>
      <div class="feed" id="feed"><div class="card"><div class="empty">Loading…</div></div></div>`);
    const box = $('#feed');
    try {
      const d = await api('/posts?limit=20');
      if (my !== token) return;
      if (!d.posts.length) {
        box.innerHTML = `<div class="card fade"><div class="empty"><b>Nothing here yet</b>First post is coming soon.</div></div>`;
        return;
      }
      box.innerHTML = d.posts.map(cardHTML).join('');
      let more = d.more;
      let last = d.posts[d.posts.length - 1].id;
      const addMore = () => {
        if (!more) return;
        const b = document.createElement('button');
        b.className = 'pill more';
        b.textContent = 'Load older posts';
        b.onclick = async () => {
          b.disabled = true;
          try {
            const n = await api('/posts?limit=20&before=' + last);
            b.remove();
            box.insertAdjacentHTML('beforeend', n.posts.map(cardHTML).join(''));
            more = n.more;
            if (n.posts.length) last = n.posts[n.posts.length - 1].id;
            addMore();
          } catch { b.disabled = false; }
        };
        box.appendChild(b);
      };
      addMore();
    } catch (e) {
      if (my === token) box.innerHTML = problem(e);
    }
  }

  // ---------- single post ----------
  const commentHTML = (c) => `
    <div class="c" data-cid="${c.id}">
      <div class="ini">${c.is_owner ? `<img src="${AV}" alt="">` : esc(c.name.trim().charAt(0) || '?')}</div>
      <div><div class="head"><b>${esc(c.name)}</b>${c.is_owner ? '<span class="badge">Author</span>' : ''}<small>${when(c.created_at)}</small>${me.admin ? '<button data-act="del-comment" aria-label="Delete comment">Delete</button>' : ''}</div>
      <p>${esc(c.body)}</p></div>
    </div>`;

  async function post(slug) {
    const my = ++token;
    render(`${topbar()}<div class="card"><div class="empty">Loading…</div></div>`);
    let d;
    try {
      d = await api('/posts/' + encodeURIComponent(slug));
    } catch (e) {
      if (my !== token) return;
      setTitle('Not found');
      render(`${topbar()}<a class="back" href="/sauce">${ic.left} All posts</a>${e.status === 404 ? `<div class="card fade"><div class="empty"><b>Post not found</b>It may have been deleted or the link is wrong.</div></div>` : problem(e)}`);
      return;
    }
    if (my !== token) return;
    me.admin = d.admin;
    const p = d.post;
    const isPost = p.kind === 'post';
    setTitle(isPost ? p.title : clip(plain(p.body), 60));
    const header = isPost
      ? `<h1>${esc(p.title)}</h1><div class="meta"><span>${fullDate(p.created_at)}</span>${p.updated_at - p.created_at > 120 ? `<span>Edited ${when(p.updated_at)}</span>` : ''}</div>`
      : `<div class="byline"><img class="av" src="${AV}" alt=""><div><b>Isaiah B</b><small>${fullDate(p.created_at)}</small></div></div>`;
    render(`${topbar()}
      <a class="back" href="/sauce">${ic.left} All posts</a>
      <article class="article fade">
        ${header}
        <div class="prose">${md(p.body)}</div>
        ${d.admin ? `<div class="tools"><a class="pill small" href="/sauce/write?edit=${p.id}">Edit</a><button class="pill small danger" data-act="del-post" data-id="${p.id}">Delete</button></div>` : ''}
      </article>
      <section class="comments" id="comments">
        <h3><span id="ccount">${d.comments.length}</span> ${'comment' + (d.comments.length === 1 ? '' : 's')}</h3>
        <div class="clist" id="clist">${d.comments.map(commentHTML).join('')}</div>
        <form class="form" id="cform" autocomplete="off">
          ${d.admin ? '' : `<input class="field" name="name" maxlength="${LIM.name}" placeholder="Your name" required>`}
          <textarea class="area" name="body" maxlength="${LIM.comment}" placeholder="Leave a comment…" required></textarea>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="row"><span class="msg grow" id="cmsg" role="status"></span><span class="count" id="ccnt">0 / ${LIM.comment}</span><button class="btn" type="submit">Post comment</button></div>
        </form>
      </section>`);

    const form = $('#cform');
    const nameField = form.elements.name;
    try { if (nameField) nameField.value = localStorage.getItem('sauce_name') || ''; } catch { /* ignore */ }
    form.elements.body.addEventListener('input', () => { $('#ccnt').textContent = `${form.elements.body.value.length} / ${LIM.comment}`; });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = $('#cmsg');
      const btn = form.querySelector('button[type=submit]');
      msg.className = 'msg';
      msg.textContent = 'Posting…';
      btn.disabled = true;
      try {
        const r = await api(`/posts/${encodeURIComponent(p.slug)}/comments`, {
          method: 'POST',
          json: { name: nameField ? nameField.value : '', body: form.elements.body.value, website: form.elements.website.value },
        });
        if (r.comment) {
          $('#clist').insertAdjacentHTML('beforeend', commentHTML(r.comment));
          const n = $('#clist').children.length;
          $('#ccount').textContent = n;
          $('#ccount').parentElement.lastChild.textContent = ' ' + (n === 1 ? 'comment' : 'comments');
        }
        try { if (nameField) localStorage.setItem('sauce_name', nameField.value.trim()); } catch { /* ignore */ }
        form.elements.body.value = '';
        $('#ccnt').textContent = `0 / ${LIM.comment}`;
        msg.textContent = 'Posted.';
      } catch (e) {
        msg.className = 'msg err';
        msg.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });
    if (location.hash === '#comments') $('#comments').scrollIntoView();
  }

  // ---------- editor ----------
  const loginView = () => `
    <div class="panel login fade">
      <h2>Sign in</h2><p>Only the site owner can write posts.</p>
      <form id="lform" class="form" style="margin-top:0">
        <input class="field" type="password" name="password" placeholder="Password" autocomplete="current-password" required autofocus>
        <div class="row"><span class="msg grow" id="lmsg" role="status"></span><button class="btn" type="submit">Log in</button></div>
      </form>
    </div>`;

  async function shrink(file) {
    const MAX = 1_150_000;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('Use a PNG, JPEG, GIF or WebP image');
    if (file.type === 'image/gif') {
      if (file.size <= MAX) return file;
      throw new Error('That GIF is over 1.1 MB. Try a shorter or smaller one.');
    }
    const bmp = await createImageBitmap(file);
    let w = bmp.width, h = bmp.height;
    if (w > 1600) { h = Math.round((h * 1600) / w); w = 1600; }
    for (const q of [0.86, 0.74, 0.6, 0.5]) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
      if (blob && blob.size <= MAX) return blob;
      w = Math.round(w * 0.82); h = Math.round(h * 0.82);
    }
    throw new Error('Could not shrink that image enough. Try a smaller one.');
  }

  async function editor() {
    const my = ++token;
    setTitle('Write');
    const editId = new URLSearchParams(location.search).get('edit');

    if (!me.configured || !me.db) {
      render(`${topbar()}<header class="hero"><span class="mono">Setup</span><h1>Almost ready</h1></header>
        <div class="note">${!me.db ? 'Connect the D1 database: in Cloudflare Pages open <b>Settings → Bindings</b>, add a D1 binding named <code>DB</code>, then redeploy.' : 'Add the <code>ADMIN_PASSWORD</code> secret: in Cloudflare Pages open <b>Settings → Variables and Secrets</b>, then redeploy.'}</div>`);
      return;
    }
    if (!me.admin) {
      render(`${topbar()}${loginView()}`);
      $('#lform').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const msg = $('#lmsg');
        msg.className = 'msg'; msg.textContent = 'Checking…';
        try {
          await api('/login', { method: 'POST', json: { password: ev.target.elements.password.value } });
          me.admin = true;
          route();
        } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
      });
      return;
    }

    let existing = null;
    if (editId) {
      try { existing = (await api('/posts/' + encodeURIComponent(editId))).post; } catch { existing = null; }
      if (my !== token) return;
    }
    let kind = existing ? existing.kind : 'update';
    let previewing = false;

    render(`${topbar()}
      <header class="hero"><span class="mono">Editor</span><h1>${existing ? 'Edit' : 'Write'}</h1></header>
      <div class="panel fade" style="margin-top:32px">
        <div class="row"><div class="seg" role="group" aria-label="Type">
          <button type="button" data-kind="update" ${existing ? 'disabled' : ''}>Update</button>
          <button type="button" data-kind="post" ${existing ? 'disabled' : ''}>Post</button></div>
          <span class="msg grow" id="hint"></span></div>
        <input class="field" id="title" maxlength="${LIM.title}" placeholder="Title" style="margin-top:14px">
        <div style="margin-top:14px">
          <div class="toolbar" role="toolbar" aria-label="Formatting">
            <button type="button" data-fmt="bold" aria-label="Bold"><b>B</b></button>
            <button type="button" data-fmt="italic" aria-label="Italic"><i>I</i></button>
            <button type="button" data-fmt="h" aria-label="Heading">H</button>
            <button type="button" data-fmt="link" aria-label="Link">${ic.link}</button>
            <button type="button" data-fmt="quote" aria-label="Quote">${ic.quote}</button>
            <button type="button" data-fmt="code" aria-label="Code">${ic.code}</button>
            <button type="button" data-fmt="list" aria-label="List">${ic.list}</button>
            <button type="button" data-fmt="image" aria-label="Add image">${ic.img}</button>
            <span class="sp"></span>
            <button type="button" id="ptoggle" aria-pressed="false">${ic.eye}&nbsp;Preview</button>
          </div>
          <textarea class="area editor-area" id="body" placeholder="Write something… Drop or paste images right in."></textarea>
          <div class="preview prose" id="preview" hidden></div>
          <input type="file" id="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden multiple>
        </div>
        <div class="row" style="margin-top:14px"><span class="msg grow" id="msg" role="status"></span><span class="count" id="cnt"></span><button class="btn" id="pub">${existing ? 'Save changes' : 'Publish'}</button></div>
      </div>
      <section class="sect"><h3>Your posts</h3><div class="panel" id="mine"><div class="empty">Loading…</div></div></section>`);

    const body = $('#body'), title = $('#title'), msg = $('#msg'), cnt = $('#cnt'), prev = $('#preview');
    if (existing) { title.value = existing.title; body.value = existing.body; }

    const say = (t, err) => { msg.className = 'msg' + (err ? ' err' : ''); msg.textContent = t; };
    const sync = () => {
      document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
      title.hidden = kind !== 'post';
      $('#hint').textContent = kind === 'post' ? 'A full article with its own page and title.' : 'A short message for the feed.';
      const max = LIM[kind];
      body.maxLength = max;
      cnt.textContent = `${body.value.length} / ${max}`;
    };
    sync();
    document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { if (!existing) { kind = b.dataset.kind; sync(); } }));
    body.addEventListener('input', sync);

    // formatting helpers
    const edit = (fn) => {
      const s = body.selectionStart, e = body.selectionEnd, v = body.value;
      const r = fn(v.slice(s, e), s, e, v);
      body.value = v.slice(0, s) + r.text + v.slice(e);
      body.focus();
      body.setSelectionRange(s + r.from, s + r.to);
      sync();
    };
    const wrap = (a, b, ph) => edit((sel) => { const t = sel || ph; return { text: a + t + b, from: a.length, to: a.length + t.length }; });
    const prefix = (p, ph) => edit((sel, s, e, v) => {
      const start = v.lastIndexOf('\n', s - 1) + 1;
      const lead = start < s ? '\n' : '';
      const t = (sel || ph).split('\n').map((l) => p + l).join('\n');
      return { text: (s === start ? '' : lead) + t, from: (s === start ? 0 : 1) + p.length, to: (s === start ? 0 : 1) + t.length };
    });
    const insert = (text) => edit(() => ({ text, from: text.length, to: text.length }));

    async function addImages(files) {
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        try {
          say(`Uploading ${f.name || 'image'}…`);
          const blob = await shrink(f);
          const res = await api('/images', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } });
          const alt = (f.name || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[\[\]()]/g, '');
          insert(`\n![${alt}](${res.url})\n`);
          say('Image added.');
        } catch (e) { say(e.message, true); }
      }
    }

    document.querySelector('.toolbar').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-fmt]');
      if (!b) return;
      ({
        bold: () => wrap('**', '**', 'bold text'),
        italic: () => wrap('*', '*', 'italic text'),
        h: () => prefix('## ', 'Heading'),
        link: () => { const u = prompt('Link address (https://…)'); if (u) wrap('[', `](${u.trim()})`, 'link text'); },
        quote: () => prefix('> ', 'Quote'),
        code: () => (body.value.slice(body.selectionStart, body.selectionEnd).includes('\n') ? wrap('```\n', '\n```', 'code') : wrap('`', '`', 'code')),
        list: () => prefix('- ', 'List item'),
        image: () => $('#file').click(),
      })[b.dataset.fmt]();
    });
    $('#file').addEventListener('change', (ev) => { addImages([...ev.target.files]); ev.target.value = ''; });
    body.addEventListener('paste', (ev) => {
      const files = [...(ev.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { ev.preventDefault(); addImages(files); }
    });
    body.addEventListener('dragover', (ev) => { ev.preventDefault(); body.classList.add('drag'); });
    body.addEventListener('dragleave', () => body.classList.remove('drag'));
    body.addEventListener('drop', (ev) => {
      ev.preventDefault(); body.classList.remove('drag');
      addImages([...ev.dataTransfer.files]);
    });

    $('#ptoggle').addEventListener('click', () => {
      previewing = !previewing;
      $('#ptoggle').setAttribute('aria-pressed', String(previewing));
      $('#ptoggle').lastChild.textContent = previewing ? ' Edit' : ' Preview';
      body.hidden = previewing; prev.hidden = !previewing;
      if (previewing) prev.innerHTML = body.value.trim() ? md(body.value) : '<p style="color:var(--dim)">Nothing to preview yet.</p>';
    });

    $('#pub').addEventListener('click', async () => {
      const btn = $('#pub');
      btn.disabled = true; say(existing ? 'Saving…' : 'Publishing…');
      try {
        const payload = { kind, title: title.value, body: body.value };
        const r = existing
          ? await api('/posts/' + existing.id, { method: 'PUT', json: payload })
          : await api('/posts', { method: 'POST', json: payload });
        go('/sauce/' + encodeURIComponent(r.slug));
      } catch (e) { say(e.message, true); btn.disabled = false; }
    });

    // existing posts
    try {
      const d = await api('/posts?limit=50');
      if (my !== token) return;
      const box = $('#mine');
      box.innerHTML = d.posts.length
        ? d.posts.map((p) => `<div class="mine" data-pid="${p.id}"><div class="t"><b>${esc(p.kind === 'post' ? p.title : clip(plain(p.body), 70))}</b><small>${p.kind === 'post' ? 'Post' : 'Update'} · ${fullDate(p.created_at)} · ${p.comment_count} comments</small></div>
          <a class="pill small" href="/sauce/${encodeURIComponent(p.slug)}">View</a><a class="pill small" href="/sauce/write?edit=${p.id}">Edit</a><button class="pill small danger" data-act="del-post" data-id="${p.id}">Delete</button></div>`).join('')
        : '<div class="empty">Nothing posted yet.</div>';
    } catch (e) { if (my === token) $('#mine').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  // ---------- routing + events ----------
  function route() {
    const path = location.pathname.replace(/\/+$/, '');
    let m;
    if (path === '/sauce') return feed();
    if (path === '/sauce/write') return editor();
    if ((m = path.match(/^\/sauce\/([^/]+)$/))) return post(decodeURIComponent(m[1]));
    ++token;
    setTitle('Not found');
    render(`${topbar()}<a class="back" href="/sauce">${ic.left} All posts</a><div class="card"><div class="empty"><b>Page not found</b></div></div>`);
  }
  function go(url) {
    history.pushState(null, '', url);
    route();
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', async (ev) => {
    const a = ev.target.closest('a[href]');
    if (a && !ev.defaultPrevented && ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !a.target && /^\/sauce(\/|\?|#|$)/.test(a.getAttribute('href'))) {
      ev.preventDefault();
      return go(a.getAttribute('href'));
    }
    const act = ev.target.closest('[data-act]');
    if (act) {
      const kind = act.dataset.act;
      try {
        if (kind === 'logout') {
          await api('/login', { method: 'DELETE' });
          me.admin = false;
          go('/sauce');
        } else if (kind === 'del-post') {
          if (!confirm('Delete this post and its comments? This cannot be undone.')) return;
          await api('/posts/' + act.dataset.id, { method: 'DELETE' });
          if (location.pathname.replace(/\/+$/, '') === '/sauce/write') act.closest('.mine').remove();
          else go('/sauce');
        } else if (kind === 'del-comment') {
          const row = act.closest('.c');
          if (!confirm('Delete this comment?')) return;
          await api('/comments/' + row.dataset.cid, { method: 'DELETE' });
          row.remove();
          const n = $('#clist').children.length;
          $('#ccount').textContent = n;
          $('#ccount').parentElement.lastChild.textContent = ' ' + (n === 1 ? 'comment' : 'comments');
        }
      } catch (e) { alert(e.message); }
      return;
    }
    const card = ev.target.closest('[data-href]');
    if (card && !ev.target.closest('a,button,input,textarea,pre') && !window.getSelection().toString()) go(card.dataset.href);
  });
  window.addEventListener('popstate', route);

  (async () => {
    try { me = await api('/me'); } catch { me = { admin: false, configured: true, db: true }; }
    route();
  })();
})();
