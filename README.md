# ⚡ Admin Portal — Universal Zero-Database CMS for Static Websites

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PHP 8.1+](https://img.shields.io/badge/PHP-8.1%2B-777BB4?logo=php&logoColor=white)](hosted-php/)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](local-cms/)
[![Zero Database](https://img.shields.io/badge/Database-None%20(Flat--File)-0B1120)](#architecture)

**Open-source, drop-in Admin Portal (`/admin`) to manage every page, SEO title, meta description, hero banner, header contact info, and image upload on any static HTML, Astro, Next.js, Hugo, or Eleventy website — with zero database and zero site rebuilds required.**

---

## Why Admin Portal?

Most static websites (built with Astro, Hugo, Jekyll, Eleventy, Next.js static export, or plain HTML) deployed to shared hosting (**Hostinger, cPanel, Apache, LiteSpeed, Nginx+PHP**) require a developer to edit code, rebuild `dist/`, and re-upload files just to change a phone number, swap a hero image, or tweak an SEO title.

**Admin Portal solves this in two flexible modes:**

| Feature | Mode 1: Hosted PHP Admin (`hosted-php/`) | Mode 2: Local-First Node CMS (`local-cms/`) |
| :--- | :--- | :--- |
| **Where it runs** | Live at `https://yourdomain.com/admin/` | Locally at `http://127.0.0.1:4400` |
| **Hosting needed** | Any Apache / Hostinger / cPanel PHP 8.1+ host | Your local machine (Node.js 18+) |
| **Database needed** | ❌ None (writes atomic JSON files) | ❌ None (edits source MDX & JSON) |
| **Rebuild required?** | ❌ **Zero rebuilds** — changes apply instantly | Runs one-click `npm run build` |
| **Manage all pages?** | ✅ Per-route SEO, H1, subheading, hero image, CTA | ✅ Blogs, News, Reviews, Clients, `site.json` |
| **Media upload?** | ✅ Drag-and-drop upload into `/assets/uploads/` | ✅ Folder organizer + usage reference check |
| **Google SERP preview** | ✅ Live `<title>` & meta description preview | ✅ Live SERP preview + EasyMDE Markdown editor |

---

## Architecture

```text
                ┌──────────────────────────────────────┐
                │   https://yourdomain.com/admin/      │
                │   (Protected by Email + Password)    │
                └──────────────────┬───────────────────┘
                                   │
                    Authenticated HTTPS + HMAC Cookie
                                   │
                                   ▼
                ┌──────────────────────────────────────┐
                │     /admin/api/index.php (PHP 8)     │
                │  • auth.json (protected by .htaccess)│
                │  • Writes /site-overrides.json       │
                │  • Writes /page-overrides.json       │
                │  • Stores uploads -> /assets/uploads │
                └──────────────────┬───────────────────┘
                                   │
                                   ▼
         Every page loads <script src="/scripts/live-overrides.js" defer>
         and updates Header, Hero, SEO Meta Tags & Images in real time!
```

---

## Quick Start 1: Drop-In Hosted Admin (`/admin`) — 60-Second Setup

Use this on **Hostinger, cPanel, Shared Hosting, or any PHP 8.1+ server** so you can manage your entire live website from `https://yourdomain.com/admin/` without ever rebuilding or re-uploading `dist/`.

### 1. Copy the `hosted-php/` files into your webroot (`public_html/`)
Copy the contents of [`hosted-php/`](hosted-php/) into your site's public folder:
- `admin/` → `public_html/admin/`
- `scripts/live-overrides.js` → `public_html/scripts/live-overrides.js`
- `site-overrides.json` → `public_html/site-overrides.json`
- `page-overrides.json` → `public_html/page-overrides.json`

### 2. Include the 1-line Live Hydrator in your website layout (`<head>` or before `</body>`)
```html
<script src="/scripts/live-overrides.js" defer></script>
```
*(Optional)* For exact targeting on complex templates, you may add `data-admin-hero-title`, `data-admin-hero-subtitle`, `data-admin-hero-image`, `data-admin-hero-cta`, `data-admin-announcement`, or `data-admin-logo` attributes to your elements — or let `live-overrides.js` auto-detect semantic `<header>`, `<h1>`, `tel:`, `mailto:`, and `<meta name="description">` tags automatically.

### 3. Open `/admin/` and set your Master Account
1. Visit **`https://yourdomain.com/admin/`**.
2. On first launch, enter your **Admin Email** and a **Master Password** (minimum 10 characters).
3. You're in! Manage **every page URL** (`/`, `/about/`, `/pricing/`, `/services/`, `/contact/`, or any custom route), global header contact details, announcement banners, and uploaded images directly from your browser.

---

## Quick Start 2: Local-First Node.js CMS (`local-cms/`)

Use this if you run an **Astro / Markdown / MDX** static repository locally and want rich Markdown writing, JSON review/client directories, media usage tracking, and one-click `npm run build`.

```bash
# 1. Install dependencies
npm install

# 2. Point to your site root (defaults to current working directory)
SITE_ROOT=/path/to/your-astro-site npm run start:local
```
Open **`http://127.0.0.1:4400`** in your browser to create your local admin password and manage MDX content collections, SEO overrides, and media assets.

---

## Security Architecture

Security is first-class across both modes:
- **Strong Hashing:** PHP uses `password_hash(..., PASSWORD_DEFAULT)` (Bcrypt / Argon2id); Node.js uses `crypto.scryptSync` with 16-byte random salt and `crypto.timingSafeEqual`.
- **Session Protection:** HMAC-SHA256 signed cookies with `HttpOnly`, `SameSite=Strict`, and automatic `Secure` flag over HTTPS.
- **Apache `.htaccess` Guard:** [`hosted-php/admin/api/.htaccess`](hosted-php/admin/api/.htaccess) enforces `Require all denied` on `auth.json`, `settings.json`, `pages.json`, and `*.log` so credentials can never be read over HTTP.
- **CSRF & Brute-Force Mitigation:** All mutating requests enforce `X-Requested-With`, and failed logins apply a progressive delay / IP rate limit.
- **Safe Media Uploads:** Strict extension allow-list (`jpg`, `jpeg`, `png`, `webp`, `avif`, `svg`, `gif`) plus server-side MIME inspection via `finfo_file()`.

---

## Hosted PHP API Reference

| Endpoint (`?action=...`) | Method | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `status` | `GET` | No | Returns initialization & authentication status |
| `setup` | `POST` | No (First run only) | Creates admin email + password hash |
| `login` | `POST` | No | Authenticates email/password & issues cookie |
| `logout` | `POST`/`GET` | No | Clears active session cookie |
| `get_settings` / `save_settings` | `GET` / `POST` | Yes | Reads/writes global site & header overrides |
| `get_pages` / `save_page` / `delete_page` | `GET` / `POST` | Yes | Per-route SEO, hero, CTA & banner management |
| `list_media` / `upload_media` / `delete_media` | `GET` / `POST` | Yes | Media library upload, listing & cleanup |
| `change_password` | `POST` | Yes | Updates password & invalidates old sessions |

---

## License

Released under the [MIT License](LICENSE). Free for personal, commercial, and client projects.
