/* Apex Admin — SPA application */
'use strict';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtSize = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function api(path, { method = 'GET', body, raw } = {}) {
  const opts = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
  if (body !== undefined && !raw) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (raw) opts.body = body;
  const res = await fetch('/api' + path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/setup')) { showAuth(); throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 3800);
}

function modal({ title, body, foot, wide }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-x" aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('.modal-x', root).onclick = close;
  $('.modal-backdrop', root).addEventListener('click', (e) => { if (e.target.classList.contains('modal-backdrop')) close(); });
  document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc_); } });
  return { close, el: $('.modal', root) };
}

function confirmDlg({ title, text, name, confirmLabel = 'Delete', danger = true, onConfirm }) {
  const m = modal({
    title,
    body: `<p class="confirm-text">${esc(text)}</p>${name ? `<p class="confirm-name">${esc(name)}</p>` : ''}`,
    foot: `<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmLabel)}</button>`,
  });
  $('[data-act="cancel"]', m.el).onclick = m.close;
  $('[data-act="ok"]', m.el).onclick = async () => {
    const btn = $('[data-act="ok"]', m.el);
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Working…';
    try { await onConfirm(); m.close(); } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = confirmLabel; }
  };
}

/* ---------- icons ---------- */
const I = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  blog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"/></svg>',
  clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1"/></svg>',
  media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4Z"/><circle cx="7" cy="7" r="1.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/></svg>',
  hammer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9"/><path d="M17.64 15 22 10.64M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/></svg>',
};
const starsHtml = (n) => { n = Number(n) || 0; return `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`; };

/* ---------- state ---------- */
const S = { posts: [], reviews: [], clients: [], media: [], categories: [], settings: {}, stats: null, editor: null, theme: localStorage.getItem('apex-admin-theme') || 'light' };
document.documentElement.setAttribute('data-theme', S.theme);

const NAV = [
  ['dashboard', 'Dashboard', I.dash], ['blogs', 'Blogs', I.blog], ['news', 'News', I.news],
  ['reviews', 'Client Reviews', I.star], ['clients', 'Clients & Companies', I.clients],
  ['media', 'Media Library', I.media], ['categories', 'Categories', I.tag], ['settings', 'Settings', I.gear],
];

/* ---------- auth screens ---------- */
async function showAuth() {
  const { needsSetup } = await api('/setup-status');
  $('#app').innerHTML = `<div class="auth-screen"><div class="auth-card">
    <div class="auth-logo"><span class="bolt">${I.bolt}</span> Apex Admin</div>
    <p class="auth-sub">${needsSetup ? 'First run — create your admin password (min 10 characters). This dashboard runs on your machine only.' : 'Content manager for Apex Electric Estimating. Enter your admin password.'}</p>
    <div class="auth-error" id="auth-err"></div>
    <form id="auth-form">
      <div class="field"><label>Password <span class="req">*</span></label><input type="password" id="auth-pass" autocomplete="${needsSetup ? 'new-password' : 'current-password'}" required /></div>
      ${needsSetup ? '<div class="field"><label>Confirm password <span class="req">*</span></label><input type="password" id="auth-pass2" autocomplete="new-password" required /></div>' : ''}
      <button class="btn btn-primary" style="width:100%;justify-content:center" type="submit">${needsSetup ? 'Create admin account' : 'Sign in'}</button>
    </form></div></div>`;
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const pass = $('#auth-pass').value;
    const err = $('#auth-err');
    err.classList.remove('show');
    try {
      if (needsSetup) {
        if (pass !== $('#auth-pass2').value) throw new Error('Passwords do not match');
        await api('/setup', { method: 'POST', body: { password: pass } });
      } else {
        await api('/login', { method: 'POST', body: { password: pass } });
      }
      location.hash = '#/dashboard';
      boot();
    } catch (ex) { err.textContent = ex.message; err.classList.add('show'); }
  };
}

/* ---------- shell ---------- */
function shell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="side-brand"><span class="bolt">${I.bolt}</span><span>Apex Admin<small>Content Manager</small></span></div>
      ${NAV.map(([id, label, icon]) => `<button class="nav-item" data-nav="${id}">${icon}<span>${label}</span><span class="count" data-count="${id}" hidden></span></button>`).join('')}
      <div class="side-foot">Local-only dashboard · <a href="http://localhost:4321/" target="_blank" rel="noopener">View site ↗</a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
        <h1 id="page-title">Dashboard</h1>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="rebuild-btn">${I.hammer} Rebuild site</button>
        <button class="btn-icon" id="theme-btn" title="Toggle theme">${S.theme === 'dark' ? I.sun : I.moon}</button>
        <button class="btn-icon" id="logout-btn" title="Sign out">${I.out}</button>
      </header>
      <main class="content" id="view"></main>
    </div></div>`;
  $$('.nav-item').forEach((b) => b.onclick = () => { location.hash = '#/' + b.dataset.nav; closeSidebar(); });
  $('#theme-btn').onclick = () => {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('apex-admin-theme', S.theme);
    document.documentElement.setAttribute('data-theme', S.theme);
    $('#theme-btn').innerHTML = S.theme === 'dark' ? I.sun : I.moon;
  };
  $('#logout-btn').onclick = async () => { await api('/logout', { method: 'POST' }); showAuth(); };
  $('#rebuild-btn').onclick = rebuildFlow;
  $('#hamburger').onclick = () => {
    $('#sidebar').classList.add('open');
    const scrim = document.createElement('div'); scrim.className = 'side-scrim';
    scrim.onclick = closeSidebar; document.body.appendChild(scrim);
  };
}
function closeSidebar() { $('#sidebar')?.classList.remove('open'); $('.side-scrim')?.remove(); }
function setActiveNav(id) { $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === id)); }
function setCounts(stats) {
  const map = { blogs: stats.blogs, news: stats.news, reviews: stats.reviews, clients: stats.clients };
  for (const [k, v] of Object.entries(map)) { const el = $(`[data-count="${k}"]`); if (el) { el.hidden = false; el.textContent = v; } }
}
const skeleton = (n = 5) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');

/* ---------- rebuild ---------- */
async function rebuildFlow() {
  const m = modal({
    title: 'Rebuild the public site',
    body: '<p class="confirm-text">Regenerates <b>dist/</b> from the current content (blogs, news, reviews, clients, media, settings). Takes ~1–2 minutes. Deploy dist/ to Hostinger afterwards to go live.</p>',
    foot: '<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" data-act="ok">Start rebuild</button>',
  });
  $('[data-act="cancel"]', m.el).onclick = m.close;
  $('[data-act="ok"]', m.el).onclick = async () => {
    $('.modal-body', m.el).innerHTML = '<p class="confirm-text">Building… this can take a couple of minutes.</p><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    $('.modal-foot', m.el).remove();
    try {
      const r = await api('/rebuild', { method: 'POST' });
      $('.modal-body', m.el).innerHTML = `<p class="confirm-text" style="color:var(--green);font-weight:600">✓ Build succeeded — dist/ is ready to deploy.</p><div class="build-log">${esc(r.tail)}</div>`;
      toast('Site rebuilt successfully');
    } catch (e) {
      $('.modal-body', m.el).innerHTML = `<p class="confirm-text" style="color:var(--red);font-weight:600">✕ Build failed</p><div class="build-log">${esc(e.message)}</div>`;
      toast('Build failed — see log', 'error');
    }
  };
}

/* ---------- dashboard ---------- */
async function viewDashboard() {
  $('#page-title').textContent = 'Dashboard'; setActiveNav('dashboard');
  $('#view').innerHTML = skeleton(8);
  const stats = await api('/stats'); S.stats = stats; setCounts(stats);
  const cards = [
    ['Published blogs', stats.blogs, '📝', 'var(--accent-soft)'],
    ['News articles', stats.news, '📰', 'var(--blue-soft)'],
    ['Client reviews', stats.reviews, '⭐', 'var(--amber-soft)'],
    ['Clients', stats.clients, '🏢', 'var(--green-soft)'],
    ['Drafts', stats.drafts, '🗂️', 'var(--surface-2)'],
  ];
  $('#view').innerHTML = `
    <div class="stats-grid">${cards.map(([l, v, ico, bg]) => `<div class="card stat"><span class="label">${l}</span><span class="value">${v}</span><span class="ico" style="background:${bg}">${ico}</span></div>`).join('')}</div>
    <div class="toolbar">
      <button class="btn btn-primary" onclick="location.hash='#/new/blog'">${I.plus} New blog post</button>
      <button class="btn btn-ghost" onclick="location.hash='#/new/news'">${I.plus} News article</button>
      <button class="btn btn-ghost" onclick="location.hash='#/reviews'">${I.plus} Add review</button>
      <button class="btn btn-ghost" onclick="location.hash='#/media'">${I.up} Upload media</button>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-head"><h2>Recently published</h2></div>
        ${stats.recent.length ? `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Type</th><th>Date</th><th>Status</th></tr></thead><tbody>
          ${stats.recent.map((r) => `<tr><td><a class="t-title" href="#/edit/${esc(r.slug)}">${esc(r.title)}</a></td>
            <td><span class="badge badge-gray">${r.type}</span></td><td>${fmtDate(r.date)}</td>
            <td>${r.draft ? '<span class="badge badge-amber">Draft</span>' : '<span class="badge badge-green">Published</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty"><div class="ico">📭</div><h3>No content yet</h3><p>Create your first post to get started.</p></div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Recent activity</h2></div><div class="card-pad" style="padding-top:8px;padding-bottom:8px">
        ${stats.activity.length ? stats.activity.map((a) => `<div class="activity-item"><span class="dot"></span><span class="what"><b>${esc(a.action)}</b> ${esc(a.detail || '')}</span><span class="when">${timeAgo(a.at)}</span></div>`).join('') : '<div class="empty" style="padding:26px"><p>No activity yet.</p></div>'}
      </div></div>
    </div>`;
}

/* ---------- posts list (blogs / news) ---------- */
async function viewPosts(kind) {
  const isNews = kind === 'news';
  $('#page-title').textContent = isNews ? 'News' : 'Blogs'; setActiveNav(kind);
  $('#view').innerHTML = skeleton(7);
  const { posts } = await api('/posts'); S.posts = posts;
  const rows = posts.filter((p) => p.isNews === isNews);
  const render = (q = '', status = 'all') => {
    const filtered = rows.filter((p) =>
      (status === 'all' || (status === 'draft' ? p.draft : !p.draft)) &&
      (!q || (p.title + ' ' + p.tags.join(' ') + ' ' + p.author).toLowerCase().includes(q.toLowerCase())));
    return filtered.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Title</th><th>Tags</th><th>Date</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${filtered.map((p) => `<tr>
        <td><a class="t-title" href="#/edit/${esc(p.slug)}">${esc(p.title)}</a><span class="t-sub">/${esc(p.slug)}/ · ${esc(p.author || '—')}</span></td>
        <td>${p.tags.slice(0, 3).map((t) => `<span class="badge badge-gray">${esc(t)}</span>`).join(' ') || '—'}</td>
        <td style="white-space:nowrap">${fmtDate(p.date)}</td>
        <td>${p.draft ? '<span class="badge badge-amber">Draft</span>' : '<span class="badge badge-green">Published</span>'}</td>
        <td><div class="row-actions">
          <button class="icon-btn" title="Edit" onclick="location.hash='#/edit/${esc(p.slug)}'">${I.edit}</button>
          <button class="icon-btn" title="Duplicate" data-dup="${esc(p.slug)}">${I.copy}</button>
          <button class="icon-btn" title="${p.draft ? 'Publish' : 'Unpublish (draft)'}" data-toggle="${esc(p.slug)}" data-draft="${p.draft}">${p.draft ? I.up : I.eye}</button>
          <button class="icon-btn danger" title="Delete" data-del="${esc(p.slug)}" data-name="${esc(p.title)}">${I.trash}</button>
        </div></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><div class="ico">${isNews ? '📰' : '✍️'}</div><h3>No ${isNews ? 'news articles' : 'blog posts'} found</h3><p>${q || status !== 'all' ? 'Try a different search or filter.' : 'Create your first one — it will appear on the public site after publishing and rebuilding.'}</p><button class="btn btn-primary" onclick="location.hash='#/new/${kind}'">${I.plus} Create ${isNews ? 'article' : 'post'}</button></div>`;
  };
  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="search-box">${I.search}<input id="q" placeholder="Search title, tag, author…" /></div>
      <select class="select" id="status"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option></select>
      <div class="spacer"></div>
      <button class="btn btn-primary" onclick="location.hash='#/new/${kind}'">${I.plus} New ${isNews ? 'article' : 'post'}</button>
    </div>
    <div class="card" id="list">${render()}</div>`;
  const refresh = () => { $('#list').innerHTML = render($('#q').value, $('#status').value); bind(); };
  const bind = () => {
    $$('[data-dup]').forEach((b) => b.onclick = async () => {
      try { const r = await api(`/posts/${b.dataset.dup}/duplicate`, { method: 'POST' }); toast('Duplicated as draft: ' + r.slug); location.hash = '#/edit/' + r.slug; } catch (e) { toast(e.message, 'error'); }
    });
    $$('[data-toggle]').forEach((b) => b.onclick = async () => {
      const toDraft = b.dataset.draft !== 'true';
      try { await api(`/posts/${b.dataset.toggle}/status`, { method: 'POST', body: { draft: toDraft } }); toast(toDraft ? 'Moved to drafts' : 'Published — rebuild to go live'); viewPosts(kind); } catch (e) { toast(e.message, 'error'); }
    });
    $$('[data-del]').forEach((b) => b.onclick = () => confirmDlg({
      title: 'Delete this post?', text: 'This permanently removes the MDX file. This cannot be undone.', name: b.dataset.name,
      onConfirm: async () => { await api('/posts/' + b.dataset.del, { method: 'DELETE' }); toast('Post deleted'); viewPosts(kind); },
    }));
  };
  $('#q').oninput = debounce(refresh, 200); $('#status').onchange = refresh; bind();
}

/* ---------- post editor ---------- */
async function viewEditor(slug, kind) {
  const isNew = !slug;
  $('#page-title').textContent = isNew ? (kind === 'news' ? 'New article' : 'New blog post') : 'Edit content';
  setActiveNav(kind === 'news' ? 'news' : 'blogs');
  $('#view').innerHTML = skeleton(9);
  let fm = {}, body = '';
  if (!isNew) {
    try { const r = await api('/posts/' + slug); fm = r.frontmatter; body = r.body; }
    catch (e) { $('#view').innerHTML = `<div class="empty"><h3>Could not load post</h3><p>${esc(e.message)}</p></div>`; return; }
  }
  const cats = await api('/categories').catch(() => ({ categories: [] }));
  const catList = (cats.categories || []).map((c) => c.name);
  const isNews = kind === 'news' || (fm.tags || []).some((t) => String(t).toLowerCase() === 'news');
  const tags = (fm.tags || []).filter((t) => String(t).toLowerCase() !== 'news');
  const v = {
    title: fm.title || '', slug: fm.slug || '', description: fm.description || '',
    seoTitle: fm.seoTitle || '', seoDescription: fm.seoDescription || '', imageAlt: fm.imageAlt || '', canonical: fm.canonical || '',
    author: fm.author || 'Apex Electric Estimating Inc', date: fm.date ? String(fm.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    image: fm.image || '', category: tags[0] || '', tags: tags.slice(1).join(', '), draft: fm.draft !== false && !isNew ? true : fm.draft === true,
  };
  $('#view').innerHTML = `
    <div class="toolbar">
      <button class="btn btn-ghost btn-sm" onclick="location.hash='#/${isNews ? 'news' : 'blogs'}'">← Back</button>
      <div class="spacer"></div>
      ${!isNew ? `<a class="btn btn-ghost btn-sm" href="http://localhost:4321/blog/${esc(v.slug)}/" target="_blank" rel="noopener">${I.eye} Live preview</a>` : ''}
      <button class="btn btn-ghost" id="save-draft">Save draft</button>
      <button class="btn btn-primary" id="publish">${isNew ? 'Publish' : 'Save & publish'}</button>
    </div>
    <div class="editor-layout">
      <div>
        <div class="card card-pad" style="margin-bottom:16px">
          <div class="field"><label>Title <span class="req">*</span></label><input type="text" id="f-title" maxlength="200" value="${esc(v.title)}" placeholder="e.g. How Electrical Estimating Wins More Bids" /><span class="counter" id="c-title"></span></div>
          <div class="form-grid">
            <div class="field"><label>URL slug <span class="req">*</span></label><input type="text" id="f-slug" value="${esc(v.slug)}" placeholder="auto-from-title" /><span class="hint">yoursite.com/blog/<b id="slug-echo">${esc(v.slug || '…')}</b>/</span></div>
            <div class="field"><label>Publication date</label><input type="date" id="f-date" value="${esc(v.date)}" /></div>
          </div>
          <div class="field"><label>Meta description <span class="req">*</span> <span class="hint">(used for SEO + listings)</span></label><textarea id="f-desc" rows="2" maxlength="320" placeholder="Compelling summary shown in search results…">${esc(v.description)}</textarea><span class="counter" id="c-desc"></span></div>
        </div>
        <div class="card card-pad">
          <div class="field" style="margin-bottom:8px"><label>Content <span class="req">*</span> <span class="hint">(Markdown — toolbar + side-by-side preview)</span></label></div>
          <textarea id="f-body">${esc(body)}</textarea>
        </div>
      </div>
      <div class="editor-side">
        <div class="card card-pad">
          <h3 style="font-family:var(--font-display);font-size:14px;margin-bottom:12px">Publishing</h3>
          <div class="field"><label>Author</label><input type="text" id="f-author" value="${esc(v.author)}" /></div>
          <div class="field"><label>Category</label><select id="f-category"><option value="">— None —</option>${catList.map((c) => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Extra tags <span class="hint">(comma-separated)</span></label><input type="text" id="f-tags" value="${esc(v.tags)}" placeholder="estimating, takeoff" /></div>
          <label class="check-row"><input type="checkbox" id="f-news" ${isNews ? 'checked' : ''} /> Also publish as News</label>
        </div>
        <div class="card card-pad">
          <h3 style="font-family:var(--font-display);font-size:14px;margin-bottom:12px">Featured image</h3>
          <div id="img-slot">${v.image ? imgPreview(v.image) : '<p class="hint" style="color:var(--faint);font-size:12.5px">No image selected.</p>'}</div>
          <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-ghost btn-sm" id="pick-img">${I.media} Choose image</button>${v.image ? '<button class="btn btn-ghost btn-sm" id="clear-img">Remove</button>' : ''}</div>
          <div class="field" style="margin-top:12px"><label>Image alt text</label><input type="text" id="f-alt" value="${esc(v.imageAlt)}" placeholder="Describe the image for accessibility + SEO" /></div>
        </div>
        <div class="card card-pad">
          <h3 style="font-family:var(--font-display);font-size:14px;margin-bottom:12px">SEO preview</h3>
          <div class="serp">
            <div class="s-url"><span class="favicon">⚡</span><span id="serp-url">apexelectricalestimatingllc.com › blog › ${esc(v.slug || '…')}</span></div>
            <div class="s-title" id="serp-title">${esc(v.seoTitle || v.title || 'Your title will appear here')}</div>
            <div class="s-desc" id="serp-desc">${esc(v.seoDescription || v.description || 'Your meta description will appear here in Google search results.')}</div>
          </div>
          <div class="field" style="margin-top:12px"><label>SEO title override <span class="hint">(optional)</span></label><input type="text" id="f-seotitle" maxlength="200" value="${esc(v.seoTitle)}" placeholder="Defaults to the post title" /></div>
          <div class="field"><label>SEO description override</label><textarea id="f-seodesc" rows="2" maxlength="320" placeholder="Defaults to meta description">${esc(v.seoDescription)}</textarea></div>
          <div class="field" style="margin-bottom:0"><label>Canonical URL <span class="hint">(optional)</span></label><input type="url" id="f-canonical" value="${esc(v.canonical)}" placeholder="https://…" /></div>
          <p class="serp-note">Preview is indicative — Google may rewrite titles/snippets.</p>
        </div>
      </div>
    </div>`;

  /* editor instance */
  if (S.editor) { try { S.editor.toTextArea(); } catch { /* noop */ } S.editor = null; }
  S.editor = new EasyMDE({
    element: $('#f-body'), spellChecker: false, status: false, minHeight: '380px',
    placeholder: 'Write your article… Markdown supported. Use ## for section headings.',
    toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'image', 'table', '|', 'preview', 'side-by-side', 'fullscreen', '|', 'guide'],
  });

  /* live counters + SERP */
  const counters = () => {
    const t = $('#f-title').value.length, d = $('#f-desc').value.length;
    $('#c-title').textContent = `${t}/200 · Google shows ~60 chars`; $('#c-title').classList.toggle('over', t > 60);
    $('#c-desc').textContent = `${d}/320 · Google shows ~160 chars`; $('#c-desc').classList.toggle('over', d > 160);
    $('#serp-title').textContent = ($('#f-seotitle').value || $('#f-title').value || 'Your title will appear here').slice(0, 70);
    $('#serp-desc').textContent = ($('#f-seodesc').value || $('#f-desc').value || 'Your meta description will appear here.').slice(0, 170);
    $('#serp-url').textContent = 'apexelectricalestimatingllc.com › blog › ' + ($('#f-slug').value || '…');
    $('#slug-echo').textContent = $('#f-slug').value || '…';
  };
  let slugTouched = !isNew && !!v.slug;
  $('#f-title').oninput = () => { if (!slugTouched) $('#f-slug').value = $('#f-title').value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90); counters(); };
  $('#f-slug').oninput = () => { slugTouched = true; counters(); };
  ['#f-desc', '#f-seotitle', '#f-seodesc'].forEach((s) => $(s).oninput = counters);
  counters();

  /* image picker */
  const setImage = (path) => {
    $('#img-slot').innerHTML = path ? imgPreview(path) : '<p class="hint" style="color:var(--faint);font-size:12.5px">No image selected.</p>';
    $('#pick-img').onclick = () => pickImage(setImage);
    const cl = $('#clear-img'); if (cl) cl.onclick = () => setImage('');
    $('#pick-img').textContent = ''; $('#pick-img').innerHTML = I.media + ' Choose image';
  };
  setImage(v.image);

  /* save */
  const collect = (draft) => {
    const title = $('#f-title').value.trim();
    const description = $('#f-desc').value.trim();
    if (!title) throw new Error('Title is required');
    if (!description) throw new Error('Meta description is required');
    const tagList = [];
    if ($('#f-news').checked) tagList.push('news');
    if ($('#f-category').value) tagList.push($('#f-category').value);
    tagList.push(...$('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean));
    const payload = {
      title, description, slug: $('#f-slug').value.trim() || undefined,
      date: $('#f-date').value, author: $('#f-author').value.trim(),
      image: $('#img-slot img')?.dataset.path || '', tags: [...new Set(tagList)], draft,
      body: S.editor.value(),
    };
    if ($('#f-seotitle').value.trim()) payload.seoTitle = $('#f-seotitle').value.trim();
    if ($('#f-seodesc').value.trim()) payload.seoDescription = $('#f-seodesc').value.trim();
    if ($('#f-alt').value.trim()) payload.imageAlt = $('#f-alt').value.trim();
    if ($('#f-canonical').value.trim()) payload.canonical = $('#f-canonical').value.trim();
    return payload;
  };
  const save = async (draft) => {
    let payload; try { payload = collect(draft); } catch (e) { toast(e.message, 'error'); return; }
    const btn = draft ? $('#save-draft') : $('#publish');
    btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = '<span class="spin"></span> Saving…';
    try {
      const r = isNew
        ? await api('/posts', { method: 'POST', body: payload })
        : await api('/posts/' + slug, { method: 'PUT', body: payload });
      toast(draft ? 'Draft saved' : 'Published — rebuild the site to go live');
      location.hash = '#/edit/' + r.slug;
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.innerHTML = old; }
  };
  $('#save-draft').onclick = () => save(true);
  $('#publish').onclick = () => save(false);
}
function imgPreview(path) {
  return `<div class="img-preview"><img src="${esc(path)}" data-path="${esc(path)}" alt="" /><span class="path">${esc(path)}</span></div>`;
}

/* ---------- image picker modal ---------- */
async function pickImage(onPick) {
  const m = modal({ title: 'Media library', wide: true, body: '<div class="skeleton"></div><div class="skeleton"></div>' });
  try {
    const { media } = await api('/media');
    $('.modal-body', m.el).innerHTML = `
      <div class="toolbar"><div class="search-box">${I.search}<input id="mq" placeholder="Search files…" /></div>
      <select class="select" id="mdir"><option value="">All folders</option>${[...new Set(media.map((x) => x.dir))].map((d) => `<option>${esc(d)}</option>`).join('')}</select></div>
      <div class="pick-grid" id="mgrid"></div>`;
    const render = () => {
      const q = $('#mq', m.el).value.toLowerCase(); const dir = $('#mdir', m.el).value;
      const rows = media.filter((x) => (!q || x.name.toLowerCase().includes(q)) && (!dir || x.dir === dir));
      $('#mgrid', m.el).innerHTML = rows.slice(0, 200).map((x) => `<div class="pick-item" data-path="${esc(x.path)}"><img loading="lazy" src="${esc(x.path)}" alt="" /><div class="pn">${esc(x.name)}</div></div>`).join('') || '<p class="hint">No images found.</p>';
      $$('.pick-item', m.el).forEach((el) => el.onclick = () => { onPick(el.dataset.path); m.close(); toast('Image selected'); });
    };
    $('#mq', m.el).oninput = debounce(render, 150); $('#mdir', m.el).onchange = render; render();
  } catch (e) { $('.modal-body', m.el).innerHTML = `<p class="confirm-text">${esc(e.message)}</p>`; }
}

/* ---------- reviews ---------- */
async function viewReviews() {
  $('#page-title').textContent = 'Client Reviews'; setActiveNav('reviews');
  $('#view').innerHTML = skeleton(6);
  const { reviews } = await api('/reviews'); S.reviews = reviews;
  const render = (q = '') => {
    const rows = reviews.filter((r) => !q || (r.company + ' ' + (r.contact || '') + ' ' + r.review).toLowerCase().includes(q.toLowerCase()));
    return rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Company</th><th>Contact</th><th>Rating</th><th>Featured</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><span class="t-title">${esc(r.company)}</span><span class="t-sub">${esc(r.businessType || '')}</span></td>
        <td>${esc(r.contact || '—')}${r.position ? `<span class="t-sub">${esc(r.position)}</span>` : ''}</td>
        <td>${r.rating ? starsHtml(r.rating) : '—'}</td>
        <td>${r.featured ? '<span class="badge badge-blue">Featured</span>' : '—'}</td>
        <td>${r.status === 'draft' ? '<span class="badge badge-amber">Draft</span>' : '<span class="badge badge-green">Published</span>'}</td>
        <td><div class="row-actions">
          <button class="icon-btn" data-edit="${esc(r.id)}" title="Edit">${I.edit}</button>
          <button class="icon-btn danger" data-del="${esc(r.id)}" data-name="${esc(r.company)}" title="Delete">${I.trash}</button>
        </div></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><div class="ico">⭐</div><h3>No reviews yet</h3><p>Add client testimonials — published ones appear on /reviews/.</p><button class="btn btn-primary" id="empty-add">${I.plus} Add review</button></div>`;
  };
  $('#view').innerHTML = `
    <div class="toolbar"><div class="search-box">${I.search}<input id="q" placeholder="Search company or contact…" /></div><div class="spacer"></div>
    <button class="btn btn-primary" id="add">${I.plus} Add review</button></div>
    <div class="card" id="list">${render()}</div>`;
  const bind = () => {
    $('#add').onclick = () => reviewEditor();
    $('#empty-add')?.addEventListener('click', () => reviewEditor());
    $$('[data-edit]').forEach((b) => b.onclick = () => reviewEditor(reviews.find((r) => r.id === b.dataset.edit)));
    $$('[data-del]').forEach((b) => b.onclick = () => confirmDlg({
      title: 'Delete this review?', text: 'Removes the testimonial from the site data.', name: b.dataset.name,
      onConfirm: async () => { await api('/reviews/' + b.dataset.del, { method: 'DELETE' }); toast('Review deleted'); viewReviews(); },
    }));
  };
  $('#q').oninput = debounce(() => { $('#list').innerHTML = render($('#q').value); bind(); }, 200);
  bind();
}
function reviewEditor(r = null) {
  const m = modal({
    title: r ? 'Edit review' : 'Add client review', wide: true,
    body: `<div class="form-grid">
      <div class="field"><label>Company name <span class="req">*</span></label><input type="text" id="r-company" value="${esc(r?.company || '')}" /></div>
      <div class="field"><label>Business type / service</label><input type="text" id="r-type" value="${esc(r?.businessType || '')}" placeholder="Electrical contractor" /></div>
      <div class="field"><label>Contact name</label><input type="text" id="r-contact" value="${esc(r?.contact || '')}" /></div>
      <div class="field"><label>Position / title</label><input type="text" id="r-position" value="${esc(r?.position || '')}" placeholder="Owner, Project Manager…" /></div>
      <div class="field"><label>Rating</label><select id="r-rating"><option value="">No rating</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${Number(r?.rating) === n ? 'selected' : ''}>${'★'.repeat(n)} (${n})</option>`).join('')}</select></div>
      <div class="field"><label>Review date</label><input type="date" id="r-date" value="${esc(r?.date || new Date().toISOString().slice(0, 10))}" /></div>
      <div class="field"><label>Website</label><input type="url" id="r-website" value="${esc(r?.website || '')}" placeholder="https://…" /></div>
      <div class="field"><label>Status</label><select id="r-status"><option value="published" ${r?.status !== 'draft' ? 'selected' : ''}>Published</option><option value="draft" ${r?.status === 'draft' ? 'selected' : ''}>Draft</option></select></div>
    </div>
    <div class="field"><label>Review / testimonial text <span class="req">*</span></label><textarea id="r-text" rows="4">${esc(r?.review || '')}</textarea></div>
    <div class="field"><label>Photo / logo</label><div id="r-img">${r?.photo ? imgPreview(r.photo) : '<span class="hint">Optional — client photo or company logo.</span>'}</div><button class="btn btn-ghost btn-sm" id="r-pick" style="margin-top:8px">${I.media} Choose image</button></div>
    <label class="check-row"><input type="checkbox" id="r-featured" ${r?.featured ? 'checked' : ''} /> Featured testimonial</label>`,
    foot: '<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" data-act="save">Save review</button>',
  });
  let photo = r?.photo || '';
  $('#r-pick', m.el).onclick = () => pickImage((p) => { photo = p; $('#r-img', m.el).innerHTML = imgPreview(p); });
  $('[data-act="cancel"]', m.el).onclick = m.close;
  $('[data-act="save"]', m.el).onclick = async () => {
    const payload = {
      company: $('#r-company', m.el).value.trim(), businessType: $('#r-type', m.el).value.trim(),
      contact: $('#r-contact', m.el).value.trim(), position: $('#r-position', m.el).value.trim(),
      rating: $('#r-rating', m.el).value, date: $('#r-date', m.el).value, website: $('#r-website', m.el).value.trim(),
      status: $('#r-status', m.el).value, review: $('#r-text', m.el).value.trim(),
      featured: $('#r-featured', m.el).checked, photo,
    };
    try {
      if (r) await api('/reviews/' + r.id, { method: 'PUT', body: payload });
      else await api('/reviews', { method: 'POST', body: payload });
      toast('Review saved'); m.close(); viewReviews();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- clients ---------- */
async function viewClients() {
  $('#page-title').textContent = 'Clients & Companies'; setActiveNav('clients');
  $('#view').innerHTML = skeleton(6);
  const { clients } = await api('/clients'); S.clients = clients;
  const render = (q = '') => {
    const rows = clients.filter((c) => !q || (c.company + ' ' + (c.industry || '') + ' ' + (c.location || '')).toLowerCase().includes(q.toLowerCase()));
    return rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Company</th><th>Industry</th><th>Location</th><th>Website</th><th>Projects</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${rows.map((c) => `<tr>
        <td><div style="display:flex;align-items:center;gap:10px">${c.logo ? `<img src="${esc(c.logo)}" alt="" style="width:30px;height:30px;object-fit:contain;border-radius:6px;background:var(--surface-2)" />` : ''}<div><span class="t-title">${esc(c.company)}</span><span class="t-sub">${esc(c.contactName || '')}</span></div></div></td>
        <td>${esc(c.industry || '—')}</td><td>${esc(c.location || '—')}</td>
        <td>${c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\//, '').slice(0, 28))}</a>` : '—'}</td>
        <td>${(c.projects || []).length}</td>
        <td><div class="row-actions">
          <button class="icon-btn" data-edit="${esc(c.id)}" title="Edit">${I.edit}</button>
          <button class="icon-btn danger" data-del="${esc(c.id)}" data-name="${esc(c.company)}" title="Delete">${I.trash}</button>
        </div></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><div class="ico">🏢</div><h3>No clients yet</h3><p>Add client companies — they appear in the Trusted Clients section on /reviews/.</p><button class="btn btn-primary" id="empty-add">${I.plus} Add client</button></div>`;
  };
  $('#view').innerHTML = `
    <div class="toolbar"><div class="search-box">${I.search}<input id="q" placeholder="Search company, industry, location…" /></div><div class="spacer"></div>
    <button class="btn btn-primary" id="add">${I.plus} Add client</button></div>
    <div class="card" id="list">${render()}</div>`;
  const bind = () => {
    $('#add').onclick = () => clientEditor();
    $('#empty-add')?.addEventListener('click', () => clientEditor());
    $$('[data-edit]').forEach((b) => b.onclick = () => clientEditor(clients.find((c) => c.id === b.dataset.edit)));
    $$('[data-del]').forEach((b) => b.onclick = () => confirmDlg({
      title: 'Delete this client?', text: 'Removes the company from the clients directory.', name: b.dataset.name,
      onConfirm: async () => { await api('/clients/' + b.dataset.del, { method: 'DELETE' }); toast('Client deleted'); viewClients(); },
    }));
  };
  $('#q').oninput = debounce(() => { $('#list').innerHTML = render($('#q').value); bind(); }, 200);
  bind();
}
function clientEditor(c = null) {
  const m = modal({
    title: c ? 'Edit client' : 'Add client', wide: true,
    body: `<div class="form-grid">
      <div class="field"><label>Company name <span class="req">*</span></label><input type="text" id="c-company" value="${esc(c?.company || '')}" /></div>
      <div class="field"><label>Contact person</label><input type="text" id="c-contact" value="${esc(c?.contactName || '')}" /></div>
      <div class="field"><label>Industry</label><input type="text" id="c-industry" value="${esc(c?.industry || '')}" placeholder="Electrical contracting" /></div>
      <div class="field"><label>Location</label><input type="text" id="c-location" value="${esc(c?.location || '')}" placeholder="Totowa, NJ" /></div>
      <div class="field"><label>Website</label><input type="url" id="c-website" value="${esc(c?.website || '')}" placeholder="https://…" /></div>
      <div class="field"><label>Contact email <span class="hint">(optional, private)</span></label><input type="email" id="c-email" value="${esc(c?.contactEmail || '')}" /></div>
    </div>
    <div class="field"><label>Associated projects <span class="hint">(one per line)</span></label><textarea id="c-projects" rows="3">${esc((c?.projects || []).join('\n'))}</textarea></div>
    <div class="field"><label>Company logo</label><div id="c-img">${c?.logo ? imgPreview(c.logo) : '<span class="hint">Optional — shown in the public clients section.</span>'}</div><button class="btn btn-ghost btn-sm" id="c-pick" style="margin-top:8px">${I.media} Choose logo</button></div>`,
    foot: '<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" data-act="save">Save client</button>',
  });
  let logo = c?.logo || '';
  $('#c-pick', m.el).onclick = () => pickImage((p) => { logo = p; $('#c-img', m.el).innerHTML = imgPreview(p); });
  $('[data-act="cancel"]', m.el).onclick = m.close;
  $('[data-act="save"]', m.el).onclick = async () => {
    const payload = {
      company: $('#c-company', m.el).value.trim(), contactName: $('#c-contact', m.el).value.trim(),
      industry: $('#c-industry', m.el).value.trim(), location: $('#c-location', m.el).value.trim(),
      website: $('#c-website', m.el).value.trim(), contactEmail: $('#c-email', m.el).value.trim(),
      projects: $('#c-projects', m.el).value.split('\n').map((s) => s.trim()).filter(Boolean), logo,
    };
    try {
      if (c) await api('/clients/' + c.id, { method: 'PUT', body: payload });
      else await api('/clients', { method: 'POST', body: payload });
      toast('Client saved'); m.close(); viewClients();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- media ---------- */
async function viewMedia() {
  $('#page-title').textContent = 'Media Library'; setActiveNav('media');
  $('#view').innerHTML = skeleton(8);
  const load = async () => {
    const { media } = await api('/media'); S.media = media;
    const render = (q = '', dir = '') => {
      const rows = media.filter((x) => (!q || x.name.toLowerCase().includes(q)) && (!dir || x.dir === dir));
      return rows.length ? `<div class="media-grid">${rows.map((x) => `<div class="media-card">
        <div class="media-thumb"><img loading="lazy" src="${esc(x.path)}" alt="${esc(x.name)}" /></div>
        <button class="icon-btn danger media-del" data-del="${esc(x.path)}" data-name="${esc(x.name)}" title="Delete">${I.trash}</button>
        <div class="media-meta"><div class="name" title="${esc(x.path)}">${esc(x.name)}</div>
        <div class="sub"><span>${fmtSize(x.size)}</span><span>${x.used ? `used ×${x.used}` : 'unused'}</span></div></div>
      </div>`).join('')}</div>` : '<div class="empty"><div class="ico">🖼️</div><h3>No images found</h3><p>Upload JPG, PNG, WebP, AVIF or SVG files.</p></div>';
    };
    $('#view').innerHTML = `
      <div class="dropzone" id="dz"><div style="font-size:26px;margin-bottom:6px">📤</div>Drag & drop images here, or <strong id="browse">browse files</strong><br /><span style="font-size:12px">JPG · PNG · WebP · AVIF · SVG · GIF — max 15MB. Saved to public/assets/uploads/</span>
        <select class="select" id="updir" style="margin-top:12px">${['uploads/general', 'uploads/blog', 'uploads/companies', 'uploads/reviews', 'uploads/clients'].map((d) => `<option>${d}</option>`).join('')}</select>
        <input type="file" id="file" accept="image/*" multiple hidden /></div>
      <div class="toolbar"><div class="search-box">${I.search}<input id="q" placeholder="Search files…" /></div>
        <select class="select" id="dir"><option value="">All folders</option>${[...new Set(media.map((x) => x.dir))].map((d) => `<option>${esc(d)}</option>`).join('')}</select>
        <div class="spacer"></div><span class="t-sub">${media.length} files</span></div>
      <div id="grid">${render()}</div>`;
    const bind = () => {
      $$('[data-del]').forEach((b) => b.onclick = () => confirmDlg({
        title: 'Delete this file?', text: 'The file will be removed from public/assets. Files referenced by content are protected unless you force delete.', name: b.dataset.name,
        onConfirm: async () => {
          try { await api('/media', { method: 'DELETE', body: { path: b.dataset.del } }); }
          catch (e) {
            if (/referenced/.test(e.message)) {
              await new Promise((res, rej) => confirmDlg({ title: 'File is in use', text: e.message + ' Force delete anyway?', name: b.dataset.name, confirmLabel: 'Force delete', onConfirm: async () => { await api('/media', { method: 'DELETE', body: { path: b.dataset.del, force: true } }); res(); } }));
            } else throw e;
          }
          toast('File deleted'); load();
        },
      }));
    };
    $('#q').oninput = debounce(() => { $('#grid').innerHTML = render($('#q').value, $('#dir').value); bind(); }, 200);
    $('#dir').onchange = () => { $('#grid').innerHTML = render($('#q').value, $('#dir').value); bind(); };
    const upload = async (files) => {
      for (const f of files) {
        const fd = new FormData(); fd.append('dir', $('#updir').value); fd.append('file', f);
        try { const r = await api('/media/upload', { method: 'POST', body: fd, raw: true }); toast('Uploaded ' + r.name); }
        catch (e) { toast(e.message, 'error'); }
      }
      load();
    };
    $('#browse').onclick = () => $('#file').click();
    $('#file').onchange = () => upload([...$('#file').files]);
    const dz = $('#dz');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); upload([...e.dataTransfer.files]); };
    bind();
  };
  load();
}

/* ---------- categories ---------- */
async function viewCategories() {
  $('#page-title').textContent = 'Categories'; setActiveNav('categories');
  $('#view').innerHTML = skeleton(4);
  const { categories } = await api('/categories'); S.categories = categories;
  const { posts } = await api('/posts');
  const usage = (name) => posts.filter((p) => p.tags.some((t) => t.toLowerCase() === name.toLowerCase())).length;
  $('#view').innerHTML = `
    <div class="grid-2">
      <div class="card"><div class="card-head"><h2>Categories</h2><span class="t-sub">used as post tags & filters</span></div>
        <div class="card-pad" id="cat-list">
          ${categories.length ? categories.map((c) => `<div class="activity-item"><span class="dot"></span>
            <span class="what"><b>${esc(c.name)}</b>${c.description ? ' — ' + esc(c.description) : ''} <span class="badge badge-gray" style="margin-left:6px">${usage(c.name)} posts</span></span>
            <button class="icon-btn danger" data-del="${esc(c.id || c.name)}" title="Delete" style="margin-left:auto">${I.trash}</button></div>`).join('')
            : '<div class="empty" style="padding:26px"><p>No categories yet — add your first.</p></div>'}
        </div></div>
      <div class="card card-pad"><h2 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px">Add category</h2>
        <div class="field"><label>Name <span class="req">*</span></label><input type="text" id="cat-name" placeholder="e.g. Cost Guides" /></div>
        <div class="field"><label>Description</label><input type="text" id="cat-desc" placeholder="Optional" /></div>
        <button class="btn btn-primary" id="cat-add">${I.plus} Add category</button></div>
    </div>`;
  $('#cat-add').onclick = async () => {
    const name = $('#cat-name').value.trim();
    if (!name) return toast('Name is required', 'error');
    try { await api('/categories', { method: 'POST', body: { name, description: $('#cat-desc').value.trim() } }); toast('Category added'); viewCategories(); }
    catch (e) { toast(e.message, 'error'); }
  };
  $$('[data-del]').forEach((b) => b.onclick = () => confirmDlg({
    title: 'Delete category?', text: 'Existing posts keep their tags; the category is removed from the editor list.', name: b.dataset.del,
    onConfirm: async () => { await api('/categories/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); toast('Category deleted'); viewCategories(); },
  }));
}

/* ---------- settings ---------- */
async function viewSettings() {
  $('#page-title').textContent = 'Settings'; setActiveNav('settings');
  $('#view').innerHTML = skeleton(8);
  const { settings: s } = await api('/settings'); S.settings = s;
  const f = (id, label, val, hint = '') => `<div class="field"><label>${label}</label><input type="text" id="${id}" value="${esc(val ?? '')}" />${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  $('#view').innerHTML = `
    <div class="grid-2">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card card-pad"><h2 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px">Business identity</h2>
          ${f('s-name', 'Legal name', s.name)}${f('s-dba', 'Display name (DBA)', s.dba)}
          <div class="form-grid">${f('s-phone', 'Phone (display)', s.phone)}${f('s-raw', 'Phone (raw)', s.phoneRaw, 'digits only, e.g. +18623667732')}</div>
          ${f('s-email', 'Email', s.email)}${f('s-url', 'Website URL', s.url)}
        </div>
        <div class="card card-pad"><h2 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px">Address & hours</h2>
          ${f('s-street', 'Street', s.address?.street)}
          <div class="form-grid-3">${f('s-city', 'City', s.address?.city)}${f('s-region', 'State', s.address?.region)}${f('s-zip', 'ZIP', s.address?.postalCode)}</div>
          ${f('s-hours', 'Weekday hours', s.hours?.weekdays)}${f('s-sat', 'Saturday hours', s.hours?.saturday)}${f('s-tz', 'Timezone label', s.hours?.timezone)}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card card-pad"><h2 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px">Pricing & promise</h2>
          ${f('s-turn', 'Quote turnaround', s.pricing?.quoteTurnaround, 'shown in heroes + form confirmations')}
          ${f('s-min', 'Starting price', s.pricing?.startingPrice)}
        </div>
        <div class="card card-pad"><h2 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px">Social profiles</h2>
          ${f('s-fb', 'Facebook', s.social?.facebook)}${f('s-ig', 'Instagram', s.social?.instagram)}${f('s-li', 'LinkedIn', s.social?.linkedin)}${f('s-x', 'X / Twitter', s.social?.x)}${f('s-yt', 'YouTube', s.social?.youtube)}
        </div>
        <button class="btn btn-primary" id="save-settings" style="justify-content:center">Save settings</button>
        <p class="hint" style="color:var(--faint);font-size:12px">Settings write to src/data/site.json and apply across the whole site on the next rebuild. Keep the phone/email accurate — they power schema.org, the contact page and the mailer.</p>
      </div>
    </div>`;
  $('#save-settings').onclick = async () => {
    const body = {
      name: $('#s-name').value.trim(), dba: $('#s-dba').value.trim(), phone: $('#s-phone').value.trim(),
      phoneRaw: $('#s-raw').value.trim(), email: $('#s-email').value.trim(), url: $('#s-url').value.trim(),
      address: { street: $('#s-street').value.trim(), city: $('#s-city').value.trim(), region: $('#s-region').value.trim(), postalCode: $('#s-zip').value.trim() },
      hours: { weekdays: $('#s-hours').value.trim(), saturday: $('#s-sat').value.trim(), timezone: $('#s-tz').value.trim() },
      pricing: { quoteTurnaround: $('#s-turn').value.trim(), startingPrice: $('#s-min').value.trim() },
      social: { facebook: $('#s-fb').value.trim(), instagram: $('#s-ig').value.trim(), linkedin: $('#s-li').value.trim(), x: $('#s-x').value.trim(), youtube: $('#s-yt').value.trim() },
    };
    try { await api('/settings', { method: 'PUT', body }); toast('Settings saved — rebuild to apply'); } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- router ---------- */
const TITLES = { dashboard: 'Dashboard', blogs: 'Blogs', news: 'News', reviews: 'Client Reviews', clients: 'Clients & Companies', media: 'Media Library', categories: 'Categories', settings: 'Settings' };
async function route() {
  if (S.editor) { try { S.editor.toTextArea(); } catch { /* noop */ } S.editor = null; }
  const h = location.hash.replace(/^#\//, '') || 'dashboard';
  const [view, arg] = h.split('/');
  try {
    if (view === 'dashboard') await viewDashboard();
    else if (view === 'blogs' || view === 'news') await viewPosts(view);
    else if (view === 'edit') await viewEditor(arg, S.posts.find((p) => p.slug === arg)?.isNews ? 'news' : 'blog');
    else if (view === 'new') await viewEditor(null, arg === 'news' ? 'news' : 'blog');
    else if (view === 'reviews') await viewReviews();
    else if (view === 'clients') await viewClients();
    else if (view === 'media') await viewMedia();
    else if (view === 'categories') await viewCategories();
    else if (view === 'settings') await viewSettings();
    else { location.hash = '#/dashboard'; }
  } catch (e) {
    if (e.message !== 'Session expired') $('#view').innerHTML = `<div class="empty"><div class="ico">⚠️</div><h3>Something went wrong</h3><p>${esc(e.message)}</p><button class="btn btn-ghost" onclick="route()">Retry</button></div>`;
  }
}
window.addEventListener('hashchange', route);

async function boot() {
  try { await api('/session'); } catch { return; }
  shell();
  api('/stats').then(setCounts).catch(() => {});
  route();
}
(async () => {
  try {
    const { needsSetup } = await api('/setup-status');
    if (needsSetup) return showAuth();
    try { await api('/session'); shell(); api('/stats').then(setCounts).catch(() => {}); route(); }
    catch { showAuth(); }
  } catch {
    $('#app').innerHTML = '<div class="auth-screen"><div class="auth-card"><div class="auth-logo"><span class="bolt">⚡</span> Apex Admin</div><p class="auth-sub">Cannot reach the admin server. Start it with <b>npm run admin</b>.</p></div></div>';
  }
})();
