# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in **Admin Portal**, please report it responsibly via GitHub Security Advisories or by opening a minimal issue without publishing exploit payloads in public threads.

## Built-In Security Guarantees

### Hosted PHP Admin (`hosted-php/`)
- **Password Hashing:** `password_hash($password, PASSWORD_DEFAULT)` (Bcrypt / Argon2id) with minimum 10-character password policy.
- **Session Cookies:** HMAC-SHA256 signed cookies with `HttpOnly`, `SameSite=Strict`, and `Secure` (auto-enabled on HTTPS).
- **CSRF Guard:** All state-mutating endpoints (`POST`) enforce `X-Requested-With`.
- **File Access Protection:** `.htaccess` denies public HTTP requests to `auth.json`, `settings.json`, `pages.json`, and log files.
- **Upload Validation:** Extension allow-list (`jpg`, `jpeg`, `png`, `webp`, `avif`, `svg`, `gif`) + server-side MIME type inspection via `finfo_file()`.

### Local Node.js CMS (`local-cms/`)
- **Loopback Binding:** Binds strictly to `127.0.0.1` so it is never exposed on external network interfaces.
- **Password Hashing:** `crypto.scryptSync()` with 16-byte random salt and `crypto.timingSafeEqual()`.
- **Path Traversal Guard:** Strictly confines all reads/writes to allow-listed project directories (`src/content`, `src/data`, `public/assets`).
