/**
 * Open Static Admin Portal — Live Client-Side Hydrator
 *
 * Drop <script src="/scripts/live-overrides.js" defer></script> into any static
 * HTML / Astro / Hugo / Next.js page to apply live edits from /admin/ without rebuilding.
 *
 * Reads:
 *  - /site-overrides.json (global contact, header CTA, announcement bar, logo)
 *  - /page-overrides.json (per-route SEO title/description, H1, subheading, hero image, CTA)
 *
 * @license MIT
 */
(() => {
  const normRoute = (p) => {
    if (!p || p === '/') return '/';
    return '/' + p.replace(/^\/+|\/+$/g, '') + '/';
  };

  async function applyGlobalOverrides() {
    try {
      const res = await fetch('/site-overrides.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data !== 'object') return;

      if (data.phone) {
        const cleanPhone = data.phone.replace(/[^\d+]/g, '');
        document.querySelectorAll('a[href^="tel:"]').forEach((el) => {
          el.href = `tel:${cleanPhone}`;
          const hasCall = el.textContent.trim().toLowerCase().startsWith('call');
          if (/(\+?\d[\d\s().-]{7,})/.test(el.textContent)) {
            el.innerHTML = el.innerHTML.replace(/(\+?\d[\d\s().-]{7,})/, data.phone);
          } else if (hasCall) {
            el.textContent = `Call ${data.phone}`;
          }
        });
      }

      if (data.email) {
        document.querySelectorAll('a[href^="mailto:"]').forEach((el) => {
          el.href = `mailto:${data.email}`;
          if (el.textContent.includes('@')) {
            el.textContent = data.email;
          }
        });
      }

      if (data.announcement) {
        const ann = document.querySelector('[data-admin-announcement], [x-show="show"] .text-xs span.truncate');
        if (ann) ann.textContent = data.announcement;
      }

      if (data.logoUrl) {
        document.querySelectorAll('header img[data-admin-logo], header .brand-logo img').forEach((img) => {
          img.src = data.logoUrl;
        });
      }
    } catch { /* graceful no-op */ }
  }

  async function applyPageOverrides() {
    try {
      const res = await fetch('/page-overrides.json', { cache: 'no-store' });
      if (!res.ok) return;
      const pages = await res.json();
      if (!pages || typeof pages !== 'object') return;

      const current = normRoute(window.location.pathname);
      const page = pages[current] || pages[window.location.pathname];
      if (!page) return;

      if (page.seoTitle) {
        document.title = page.seoTitle;
      }
      if (page.seoDescription) {
        let meta = document.querySelector('meta[name="description"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'description');
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', page.seoDescription);
      }

      if (page.heroHeading) {
        const h1 = document.querySelector('[data-admin-hero-title], main h1, section h1, h1');
        if (h1) h1.textContent = page.heroHeading;
      }

      if (page.heroSubheading) {
        const sub = document.querySelector('[data-admin-hero-subtitle], #hero p, main section:first-of-type p');
        if (sub) sub.textContent = page.heroSubheading;
      }

      if (page.heroImage) {
        const img = document.querySelector('[data-admin-hero-image], #hero img, main section:first-of-type img');
        if (img) img.src = page.heroImage;
      }

      if (page.ctaText || page.ctaLink) {
        const cta = document.querySelector('[data-admin-hero-cta], #hero a[href*="contact"], main section:first-of-type a.btn, main section:first-of-type a[href*="contact"]');
        if (cta) {
          if (page.ctaText) {
            const span = cta.querySelector('span');
            if (span) span.textContent = page.ctaText;
            else cta.textContent = page.ctaText;
          }
          if (page.ctaLink) cta.setAttribute('href', page.ctaLink);
        }
      }

      if (page.bannerNotice) {
        const existing = document.getElementById('admin-page-notice');
        if (!existing) {
          const bar = document.createElement('div');
          bar.id = 'admin-page-notice';
          bar.style.cssText = 'background:#1D4ED8;color:#FFFFFF;text-align:center;padding:0.55rem 1rem;font-size:0.875rem;font-weight:600;';
          bar.textContent = page.bannerNotice;
          const main = document.querySelector('main') || document.body;
          main.prepend(bar);
        }
      }
    } catch { /* graceful no-op */ }
  }

  function run() {
    applyGlobalOverrides();
    applyPageOverrides();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
