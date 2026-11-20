---
name: admin-portal
description: Integrate, configure, and secure Admin Portal (zero-database Hosted PHP 8.1+ drop-in /admin or Local Node.js static CMS) to manage all website pages, SEO meta tags, headers, hero sections, and media uploads on static HTML, Astro, Hugo, Eleventy, and Next.js sites.
---

# Admin Portal Skill

Use this skill when adding **Admin Portal** (`https://github.com/6t9xstar/admin-portal`) to a static website so the site owner can manage every page, SEO title/description, hero banner, header contact details, announcement bar, and uploaded images.

## 1. Choose the Right Integration Mode

1. **Hosted PHP Drop-In Mode (`hosted-php/`) — Best for Shared Hosting (Hostinger, cPanel, Apache, LiteSpeed):**
   - No Node.js server or database required on host.
   - Changes apply immediately across all live pages without triggering a full site rebuild.
   - Copy into webroot (`public_html/` or Astro `public/`):
     - `hosted-php/admin/` → `<webroot>/admin/`
     - `hosted-php/scripts/live-overrides.js` → `<webroot>/scripts/live-overrides.js`
     - `hosted-php/site-overrides.json` → `<webroot>/site-overrides.json`
     - `hosted-php/page-overrides.json` → `<webroot>/page-overrides.json`

2. **Local-First Node.js CMS (`local-cms/`) — Best for Astro / MDX / Markdown Source Repos:**
   - Runs locally at `http://127.0.0.1:4400` and edits `.mdx` frontmatter/body + `src/data/*.json` directly.
   - Run from target repo root:
     ```bash
     SITE_ROOT=/path/to/repo npm run start:local
     ```

## 2. Wire `live-overrides.js` Into Any Website Layout

Add the lightweight hydrator script inside the shared base layout (`<head>` or before `</body>`):

```html
<script src="/scripts/live-overrides.js" defer></script>
```

### Recommended `data-admin-*` Element Hooks

While `live-overrides.js` automatically detects `<meta name="description">`, `<title>`, `tel:`, `mailto:`, and the primary `<h1>`, adding explicit hooks guarantees zero ambiguity on custom layouts:

- `data-admin-announcement` — Top announcement bar text span
- `data-admin-logo` — Header `<img>` brand logo
- `data-admin-hero-title` — Main `<h1>` headline in hero section
- `data-admin-hero-subtitle` — Hero lead paragraph
- `data-admin-hero-image` — Hero `<img>` banner
- `data-admin-hero-cta` — Primary CTA `<a>` link/button

## 3. Security Verification Checklist

Before finishing deployment, verify:
1. Direct HTTP GET to `/admin/api/auth.json`, `/admin/api/settings.json`, and `/admin/api/pages.json` returns **403 Forbidden** (enforced by `admin/api/.htaccess`).
2. First-run setup uses a strong password (**10+ characters**) + valid admin email.
3. Exclude `/admin` from aggressive CDN/Cloudflare page caching if HTML responses are cached.
4. Confirm `.gitignore` excludes `auth.json`, `settings.json`, `pages.json`, `admin-config.json`, `activity.json`, and `assets/uploads/`.
