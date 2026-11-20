#!/usr/bin/env node
/**
 * Apex Admin — local-first content management server.
 *
 * The public site is Astro STATIC output on shared hosting: there is no
 * production database, so this dashboard manages the real content sources
 * (MDX posts, JSON data, public/assets media) that the site builds from.
 * Publishing writes files; `Rebuild site` regenerates dist/; deployment
 * to Hostinger stays the owner's existing step.
 *
 * Security model: binds to 127.0.0.1 ONLY (never exposed publicly),
 * scrypt-hashed password, HMAC-signed HttpOnly SameSite=Strict session
 * cookie, CSRF header check on mutations, allow-listed write paths,
 * sanitized slugs/filenames, login rate limiting.
 *
 * Run: npm run admin  →  http://127.0.0.1:4400
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import Busboy from 'busboy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.SITE_ROOT || process.cwd());
const DEFAULT_AUTHOR = process.env.DEFAULT_AUTHOR || 'Site Admin';
const CONFIG_FILE = path.join(__dirname, 'admin-config.json');
const ACTIVITY_FILE = path.join(__dirname, 'activity.json');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.ADMIN_PORT || 4400);
const SESSION_HOURS = 12;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_UPLOAD = 15 * 1024 * 1024;
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg', '.gif', '.ico']);
const UPLOAD_DIRS = new Set(['uploads/general', 'uploads/blog', 'uploads/companies', 'uploads/reviews', 'uploads/clients']);

/* ---------------- utilities ---------------- */
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
const okSlug = (s) => /^[a-z0-9][a-z0-9-]{0,89}$/.test(s);

function safePath(rel, allowedRoots) {
  if (typeof rel !== 'string' || rel.includes('\0') || rel.includes('..')) return null;
  const abs = path.resolve(ROOT, rel.replace(/^[/\\]+/, ''));
  const ok = allowedRoots.some((r) => abs === r || abs.startsWith(r + path.sep));
  return ok ? abs : null;
}
async function atomicWrite(file, content) {
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, file);
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_JSON) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function logActivity(action, detail) {
  try {
    const list = fs.existsSync(ACTIVITY_FILE) ? JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8')) : [];
    list.unshift({ at: new Date().toISOString(), action, detail });
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(list.slice(0, 200), null, 2));
  } catch { /* activity log is best-effort */ }
}

/* ---------------- auth ---------------- */
function loadConfig() { return fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null; }
function hashPassword(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function makeToken(secret) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const sig = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}
function validToken(token, secret) {
  if (!token || !secret) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expect = crypto.createHmac('sha256', secret).update(exp).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch { return false; }
}
function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const loginAttempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + 15 * 60 * 1000; }
  loginAttempts.set(ip, rec);
  return rec.count >= 8;
}
function bumpAttempt(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, reset: Date.now() + 15 * 60 * 1000 };
  rec.count++; loginAttempts.set(ip, rec);
}

/* ---------------- posts (MDX) ---------------- */
function postFile(slug) { return path.join(BLOG_DIR, slug + '.mdx'); }
async function listPosts() {
  const files = (await fsp.readdir(BLOG_DIR)).filter((f) => f.endsWith('.mdx'));
  const out = [];
  for (const f of files) {
    try {
      const { data } = matter.read(path.join(BLOG_DIR, f));
      out.push({
        slug: data.slug || f.replace(/\.mdx$/, ''),
        title: data.title || '(untitled)',
        description: data.description || '',
        date: data.date ? new Date(data.date).toISOString() : null,
        updated: data.updated ? new Date(data.updated).toISOString() : null,
        author: data.author || '',
        image: data.image || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        draft: !!data.draft,
        isNews: Array.isArray(data.tags) && data.tags.some((t) => String(t).toLowerCase() === 'news'),
      });
    } catch { /* skip unparseable file, surface via API error on open */ }
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function validatePost(b, { partial = false } = {}) {
  const errs = [];
  const need = (k, v) => { if (!partial && (v === undefined || v === null || v === '')) errs.push(k + ' is required'); };
  need('title', b.title); need('description', b.description);
  if (b.title !== undefined && (typeof b.title !== 'string' || b.title.length > 200)) errs.push('title must be ≤200 chars');
  if (b.description !== undefined && (typeof b.description !== 'string' || b.description.length > 320)) errs.push('description must be ≤320 chars');
  if (b.slug !== undefined && !okSlug(b.slug)) errs.push('slug must be lowercase letters, numbers, dashes');
  if (b.date !== undefined && b.date !== '' && isNaN(Date.parse(b.date))) errs.push('date is invalid');
  if (b.tags !== undefined && (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== 'string'))) errs.push('tags must be a list of strings');
  if (b.image !== undefined && typeof b.image !== 'string') errs.push('image must be a path string');
  return errs;
}
function serializePost(data, body) {
  const ordered = {};
  const keys = ['slug', 'title', 'description', 'date', 'updated', 'draft', 'author', 'image', 'tags', 'relatedServices', 'faqs'];
  for (const k of keys) if (data[k] !== undefined && data[k] !== null && data[k] !== '') ordered[k] = data[k];
  for (const k of Object.keys(data)) if (!(k in ordered) && data[k] !== undefined) ordered[k] = data[k];
  if (typeof ordered.date === 'string') ordered.date = ordered.date.slice(0, 10);
  if (typeof ordered.updated === 'string') ordered.updated = ordered.updated.slice(0, 10);
  return matter.stringify('\n' + body.replace(/^\n+/, '') + '\n', ordered);
}

/* ---------------- media ---------------- */
async function walkImages(dir, base = dir, out = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walkImages(abs, base, out);
    else if (IMG_EXT.has(path.extname(e.name).toLowerCase())) {
      const st = await fsp.stat(abs);
      out.push({
        path: '/assets/' + path.relative(base, abs).split(path.sep).join('/'),
        name: e.name,
        dir: path.relative(base, path.dirname(abs)).split(path.sep).join('/') || '.',
        size: st.size,
        mtime: st.mtime.toISOString(),
      });
    }
  }
  return out;
}
async function sourceIndex() {
  const texts = [];
  const walk = async (d) => {
    let es; try { es = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const a = path.join(d, e.name);
      if (e.isDirectory()) await walk(a);
      else if (/\.(astro|mdx|md|json|mjs|js|ts|css|html)$/.test(e.name)) {
        try { texts.push(await fsp.readFile(a, 'utf8')); } catch { /* ignore */ }
      }
    }
  };
  await walk(path.join(ROOT, 'src'));
  return texts.join('\n');
}

/* ---------------- rebuild ---------------- */
let building = false;
function runBuild() {
  return new Promise((resolve) => {
    if (building) return resolve({ success: false, tail: 'A build is already running.' });
    building = true;
    const child = spawn('npm run build', { cwd: ROOT, shell: true, env: process.env });
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, 10 * 60 * 1000);
    child.stdout.on('data', (d) => { out += d.toString(); if (out.length > 200000) out = out.slice(-100000); });
    child.stderr.on('data', (d) => { out += d.toString(); if (out.length > 200000) out = out.slice(-100000); });
    child.on('close', (code) => {
      clearTimeout(timer); building = false;
      const tail = out.split('\n').filter(Boolean).slice(-14).join('\n');
      logActivity('rebuild', code === 0 ? 'success' : 'failed');
      resolve({ success: code === 0, tail });
    });
  });
}

/* ---------------- request handler ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;
  const cfg = loadConfig();
  const ip = req.socket.remoteAddress || 'local';

  try {
    /* ---- API ---- */
    if (p.startsWith('/api/')) {
      const method = req.method;
      const mutating = method !== 'GET' && method !== 'HEAD';
      if (mutating && req.headers['x-requested-with'] !== 'fetch') return json(res, 403, { error: 'Missing CSRF header' });

      // setup + login are pre-auth
      if (p === '/api/setup-status' && method === 'GET') return json(res, 200, { needsSetup: !cfg });
      if (p === '/api/setup' && method === 'POST') {
        if (cfg) return json(res, 409, { error: 'Admin is already set up' });
        const b = await readBody(req);
        if (typeof b.password !== 'string' || b.password.length < 10) return json(res, 400, { error: 'Password must be at least 10 characters' });
        const salt = crypto.randomBytes(16).toString('hex');
        const secret = crypto.randomBytes(32).toString('hex');
        const conf = { salt, secret, passwordHash: hashPassword(b.password, salt), createdAt: new Date().toISOString() };
        await atomicWrite(CONFIG_FILE, JSON.stringify(conf, null, 2));
        logActivity('setup', 'admin password created');
        res.setHeader('Set-Cookie', `apex_admin=${makeToken(secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
        return json(res, 200, { success: true });
      }
      if (p === '/api/login' && method === 'POST') {
        if (!cfg) return json(res, 409, { error: 'Setup required' });
        if (rateLimited(ip)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
        const b = await readBody(req);
        const hash = hashPassword(String(b.password || ''), cfg.salt);
        let ok = false;
        try { ok = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(cfg.passwordHash)); } catch { ok = false; }
        if (!ok) { bumpAttempt(ip); return json(res, 401, { error: 'Wrong password' }); }
        loginAttempts.delete(ip);
        logActivity('login', 'success');
        res.setHeader('Set-Cookie', `apex_admin=${makeToken(cfg.secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
        return json(res, 200, { success: true });
      }

      // everything else requires a session
      if (!cfg || !validToken(getCookie(req, 'apex_admin'), cfg.secret)) return json(res, 401, { error: 'Not authenticated' });

      if (p === '/api/session' && method === 'GET') return json(res, 200, { authenticated: true });
      if (p === '/api/logout' && method === 'POST') {
        res.setHeader('Set-Cookie', 'apex_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json(res, 200, { success: true });
      }

      /* stats */
      if (p === '/api/stats' && method === 'GET') {
        const posts = await listPosts();
        const reviews = await readJson(path.join(DATA_DIR, 'client-reviews.json'), []);
        const clients = await readJson(path.join(DATA_DIR, 'clients.json'), []);
        const blogs = posts.filter((x) => !x.isNews);
        const news = posts.filter((x) => x.isNews);
        const recent = [...posts].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8)
          .map((x) => ({ type: x.isNews ? 'news' : 'blog', title: x.title, slug: x.slug, date: x.date, draft: x.draft }));
        const activity = (await readJson(ACTIVITY_FILE, [])).slice(0, 12);
        return json(res, 200, {
          blogs: blogs.filter((x) => !x.draft).length,
          news: news.filter((x) => !x.draft).length,
          reviews: reviews.filter((r) => r.status !== 'draft').length,
          clients: clients.length,
          drafts: posts.filter((x) => x.draft).length + reviews.filter((r) => r.status === 'draft').length,
          recent, activity,
        });
      }

      /* posts */
      if (p === '/api/posts' && method === 'GET') return json(res, 200, { posts: await listPosts() });
      if (p === '/api/posts' && method === 'POST') {
        const b = await readBody(req);
        const errs = validatePost(b);
        if (errs.length) return json(res, 400, { error: errs.join('; ') });
        const slug = b.slug || slugify(b.title);
        if (!okSlug(slug)) return json(res, 400, { error: 'Could not derive a valid slug' });
        if (fs.existsSync(postFile(slug))) return json(res, 409, { error: 'A post with this slug already exists' });
        const data = {
          slug, title: b.title, description: b.description,
          date: b.date || new Date().toISOString().slice(0, 10),
          draft: b.draft !== false,
          author: b.author || DEFAULT_AUTHOR,
          image: b.image || '', tags: b.tags || [],
        };
        if (b.relatedServices?.length) data.relatedServices = b.relatedServices;
        if (b.faqs?.length) data.faqs = b.faqs;
        await atomicWrite(postFile(slug), serializePost(data, b.body || ''));
        logActivity('post.create', slug);
        return json(res, 200, { success: true, slug });
      }
      const postMatch = p.match(/^\/api\/posts\/([a-z0-9-]+)(\/duplicate|\/status)?$/);
      if (postMatch) {
        const slug = postMatch[1];
        const file = postFile(slug);
        if (!fs.existsSync(file)) return json(res, 404, { error: 'Post not found' });
        if (method === 'GET' && !postMatch[2]) {
          const parsed = matter.read(file);
          return json(res, 200, { slug, frontmatter: parsed.data, body: parsed.content.replace(/^\n+/, '') });
        }
        if (method === 'PUT' && !postMatch[2]) {
          const b = await readBody(req);
          const errs = validatePost(b, { partial: true });
          if (errs.length) return json(res, 400, { error: errs.join('; ') });
          const parsed = matter.read(file);
          const data = { ...parsed.data, ...b };
          delete data.body;
          const newSlug = b.slug || slug;
          if (!okSlug(newSlug)) return json(res, 400, { error: 'Invalid slug' });
          if (newSlug !== slug && fs.existsSync(postFile(newSlug))) return json(res, 409, { error: 'Target slug already exists' });
          data.slug = newSlug;
          if (b.draft === false) data.updated = new Date().toISOString().slice(0, 10);
          const content = serializePost(data, b.body !== undefined ? b.body : parsed.content);
          if (newSlug !== slug) { await atomicWrite(postFile(newSlug), content); await fsp.unlink(file); }
          else await atomicWrite(file, content);
          logActivity('post.update', newSlug);
          return json(res, 200, { success: true, slug: newSlug });
        }
        if (method === 'DELETE' && !postMatch[2]) {
          await fsp.unlink(file);
          logActivity('post.delete', slug);
          return json(res, 200, { success: true });
        }
        if (method === 'POST' && postMatch[2] === '/duplicate') {
          const parsed = matter.read(file);
          let newSlug = slug + '-copy'; let i = 2;
          while (fs.existsSync(postFile(newSlug))) newSlug = slug + '-copy-' + i++;
          const data = { ...parsed.data, slug: newSlug, title: (parsed.data.title || slug) + ' (Copy)', draft: true };
          await atomicWrite(postFile(newSlug), serializePost(data, parsed.content));
          logActivity('post.duplicate', newSlug);
          return json(res, 200, { success: true, slug: newSlug });
        }
        if (method === 'POST' && postMatch[2] === '/status') {
          const b = await readBody(req);
          const parsed = matter.read(file);
          parsed.data.draft = !!b.draft;
          if (!b.draft) parsed.data.updated = new Date().toISOString().slice(0, 10);
          await atomicWrite(file, serializePost(parsed.data, parsed.content));
          logActivity(b.draft ? 'post.draft' : 'post.publish', slug);
          return json(res, 200, { success: true });
        }
      }

      /* reviews + clients + categories (JSON collections) */
      const collMatch = p.match(/^\/api\/(reviews|clients|categories)(?:\/([a-z0-9-]+))?$/);
      if (collMatch) {
        const kind = collMatch[1]; const id = collMatch[2];
        const file = path.join(DATA_DIR, kind === 'reviews' ? 'client-reviews.json' : kind === 'clients' ? 'clients.json' : 'categories.json');
        const rows = await readJson(file, kind === 'categories' ? { categories: [] } : []);
        const list = kind === 'categories' ? rows.categories : rows;
        const save = async (next) => {
          const payload = kind === 'categories' ? { categories: next } : next;
          await atomicWrite(file, JSON.stringify(payload, null, 2) + '\n');
        };
        const validateRow = (b) => {
          const e = [];
          if (kind === 'reviews') {
            if (!b.company || typeof b.company !== 'string') e.push('company is required');
            if (!b.review || typeof b.review !== 'string') e.push('review text is required');
            if (b.rating !== undefined && b.rating !== '' && (Number(b.rating) < 1 || Number(b.rating) > 5)) e.push('rating must be 1–5');
          } else if (kind === 'clients') {
            if (!b.company || typeof b.company !== 'string') e.push('company is required');
            if (b.website && !/^https?:\/\/.+\..+/.test(b.website)) e.push('website must be a valid http(s) URL');
          } else {
            if (!b.name || typeof b.name !== 'string') e.push('name is required');
          }
          return e;
        };
        if (method === 'GET' && !id) return json(res, 200, { [kind]: list });
        if (method === 'POST' && !id) {
          const b = await readBody(req);
          const e = validateRow(b);
          if (e.length) return json(res, 400, { error: e.join('; ') });
          const row = { ...b, id: b.id || slugify(b.company || b.name) || crypto.randomBytes(4).toString('hex') };
          if (list.some((r) => r.id === row.id)) return json(res, 409, { error: 'An entry with this id already exists' });
          if (kind === 'reviews' && row.rating !== undefined && row.rating !== '') row.rating = Number(row.rating);
          list.push(row); await save(list);
          logActivity(kind + '.create', row.id);
          return json(res, 200, { success: true, id: row.id });
        }
        if (id) {
          const idx = list.findIndex((r) => r.id === id);
          if (idx === -1) return json(res, 404, { error: 'Not found' });
          if (method === 'GET') return json(res, 200, { [kind.slice(0, -1)]: list[idx] });
          if (method === 'PUT') {
            const b = await readBody(req);
            const e = validateRow({ ...list[idx], ...b });
            if (e.length) return json(res, 400, { error: e.join('; ') });
            const row = { ...list[idx], ...b, id };
            if (kind === 'reviews' && row.rating !== undefined && row.rating !== '') row.rating = Number(row.rating);
            list[idx] = row; await save(list);
            logActivity(kind + '.update', id);
            return json(res, 200, { success: true });
          }
          if (method === 'DELETE') {
            list.splice(idx, 1); await save(list);
            logActivity(kind + '.delete', id);
            return json(res, 200, { success: true });
          }
        }
      }

      /* media */
      if (p === '/api/media' && method === 'GET') {
        const images = await walkImages(ASSETS_DIR);
        const idx = await sourceIndex();
        for (const img of images) {
          const needle = img.name;
          let count = 0, pos = idx.indexOf(needle);
          while (pos !== -1 && count < 99) { count++; pos = idx.indexOf(needle, pos + needle.length); }
          img.used = count;
        }
        images.sort((a, b) => b.mtime.localeCompare(a.mtime));
        return json(res, 200, { media: images });
      }
      if (p === '/api/media/upload' && method === 'POST') {
        const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD, files: 1 } });
        let targetDir = 'uploads/general'; let result = null; let errored = null;
        let pending = 0; let parsed = false;
        const done = new Promise((resolve) => {
          const maybeDone = () => { if (parsed && pending === 0) resolve(); };
          bb.on('field', (name, val) => { if (name === 'dir' && UPLOAD_DIRS.has(val)) targetDir = val; });
          bb.on('file', (name, stream, info) => {
            const ext = path.extname(info.filename || '').toLowerCase();
            if (!IMG_EXT.has(ext)) { errored = 'Unsupported file type. Use JPG, PNG, WebP, AVIF, SVG, GIF or ICO.'; stream.resume(); return; }
            const base = slugify(path.basename(info.filename || 'image', ext)) || 'image';
            const dirAbs = path.join(ASSETS_DIR, targetDir);
            fs.mkdirSync(dirAbs, { recursive: true });
            let fname = base + ext; let i = 2;
            while (fs.existsSync(path.join(dirAbs, fname))) fname = base + '-' + i++ + ext;
            const abs = path.join(dirAbs, fname);
            pending++;
            const ws = fs.createWriteStream(abs);
            stream.pipe(ws);
            ws.on('close', () => { result = { path: '/assets/' + targetDir + '/' + fname, name: fname }; pending--; maybeDone(); });
            ws.on('error', () => { errored = 'Could not save file'; pending--; maybeDone(); });
            stream.on('limit', () => { errored = 'File exceeds the 15MB limit'; try { fs.unlinkSync(abs); } catch { /* noop */ } });
          });
          bb.on('close', () => { parsed = true; maybeDone(); });
          bb.on('error', () => { errored = 'Upload failed'; parsed = true; maybeDone(); });
        });
        req.pipe(bb);
        await done;
        if (errored) return json(res, 400, { error: errored });
        if (!result) return json(res, 400, { error: 'No file received' });
        logActivity('media.upload', result.path);
        return json(res, 200, { success: true, ...result });
      }
      if (p === '/api/media' && method === 'DELETE') {
        const b = await readBody(req);
        const rel = String(b.path || '').replace(/^\//, '');
        const abs = safePath('public/' + rel, [ASSETS_DIR]);
        if (!abs || !fs.existsSync(abs)) return json(res, 400, { error: 'Invalid media path' });
        if (!b.force) {
          const idx = await sourceIndex();
          if (idx.includes(path.basename(abs))) return json(res, 409, { error: 'This file is referenced by site content. Remove references first or force delete.' });
        }
        await fsp.unlink(abs);
        logActivity('media.delete', b.path);
        return json(res, 200, { success: true });
      }

      /* settings (site.json) */
      if (p === '/api/settings' && method === 'GET') return json(res, 200, { settings: await readJson(path.join(DATA_DIR, 'site.json'), {}) });
      if (p === '/api/settings' && method === 'PUT') {
        const b = await readBody(req);
        const file = path.join(DATA_DIR, 'site.json');
        const cur = await readJson(file, {});
        const str = (v) => typeof v === 'string' && v.length <= 300;
        const next = { ...cur };
        for (const k of ['name', 'dba', 'phone', 'phoneRaw', 'email', 'url']) if (b[k] !== undefined) { if (!str(b[k])) return json(res, 400, { error: k + ' must be a string ≤300 chars' }); next[k] = b[k]; }
        if (b.address) next.address = { ...cur.address, ...b.address };
        if (b.hours) next.hours = { ...cur.hours, ...b.hours };
        if (b.pricing) next.pricing = { ...cur.pricing, ...b.pricing };
        if (b.social) next.social = { ...cur.social, ...b.social };
        await atomicWrite(file, JSON.stringify(next, null, 2) + '\n');
        logActivity('settings.update', 'site.json');
        return json(res, 200, { success: true });
      }

      /* rebuild */
      if (p === '/api/rebuild' && method === 'POST') {
        const r = await runBuild();
        return json(res, r.success ? 200 : 500, r);
      }
      if (p === '/api/activity' && method === 'GET') return json(res, 200, { activity: await readJson(ACTIVITY_FILE, []) });

      return json(res, 404, { error: 'Unknown API endpoint' });
    }

    /* ---- static admin UI ---- */
    let rel = p === '/' ? '/index.html' : p;
    const abs = safePath('admin/public' + rel, [path.join(__dirname, 'public')]);
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    json(res, 500, { error: e.message || 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Apex Admin → http://${HOST}:${PORT}\n  Bound to localhost only — never exposed to the public site.\n  ${loadConfig() ? 'Login with your admin password.' : 'First run: create your admin password in the browser.'}\n`);
});
