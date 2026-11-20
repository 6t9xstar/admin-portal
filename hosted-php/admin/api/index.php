<?php
/**
 * Open Static Admin Portal — Hosted PHP API
 *
 * Lightweight, zero-database admin backend for static websites (Astro, HTML,
 * Hugo, Next.js static export, Eleventy) hosted on Apache/PHP 8.1+ (Hostinger,
 * cPanel, Shared Hosting).
 *
 * Security:
 *  - password_hash() / password_verify() (Bcrypt / Argon2id)
 *  - HMAC-SHA256 signed HttpOnly SameSite=Strict session cookie
 *  - CSRF custom-header verification (X-Requested-With)
 *  - Brute-force attempt throttle
 *  - Strict MIME + extension validation on media uploads
 *
 * @license MIT
 */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-store, no-cache, must-revalidate');

$AUTH_FILE        = __DIR__ . '/auth.json';
$SETTINGS_FILE    = __DIR__ . '/settings.json';
$PAGES_FILE       = __DIR__ . '/pages.json';
$PUBLIC_ROOT      = dirname(__DIR__, 2);
$PUBLIC_OVERRIDES = $PUBLIC_ROOT . '/site-overrides.json';
$PUBLIC_PAGES     = $PUBLIC_ROOT . '/page-overrides.json';
$UPLOAD_DIR       = $PUBLIC_ROOT . '/assets/uploads';

const COOKIE_NAME   = 'static_admin_session';
const SESSION_TTL   = 86400; // 24 hours
const MAX_UPLOAD_MB = 15;

function send_json(int $code, array $data): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function get_auth_data(): array {
    global $AUTH_FILE;
    if (!file_exists($AUTH_FILE)) {
        return ['initialized' => false, 'email' => '', 'password_hash' => '', 'secret' => ''];
    }
    $raw = @file_get_contents($AUTH_FILE);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) {
        return ['initialized' => false, 'email' => '', 'password_hash' => '', 'secret' => ''];
    }
    return $data;
}

function save_auth_data(array $data): bool {
    global $AUTH_FILE;
    return (bool) @file_put_contents($AUTH_FILE, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function verify_session(array $auth): bool {
    if (empty($auth['initialized']) || empty($auth['secret'])) {
        return false;
    }
    $token = $_COOKIE[COOKIE_NAME] ?? '';
    if (!$token || !str_contains($token, '.')) {
        return false;
    }
    [$expiry, $sig] = explode('.', $token, 2);
    if ((int) $expiry < time()) {
        return false;
    }
    $expected = hash_hmac('sha256', (string) $expiry, $auth['secret']);
    return hash_equals($expected, $sig);
}

function issue_session_cookie(string $secret): void {
    $expiry = time() + SESSION_TTL;
    $sig = hash_hmac('sha256', (string) $expiry, $secret);
    $val = "{$expiry}.{$sig}";
    $secure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
              (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    setcookie(COOKIE_NAME, $val, [
        'expires'  => $expiry,
        'path'     => '/admin/',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function clear_session_cookie(): void {
    setcookie(COOKIE_NAME, '', [
        'expires'  => time() - 3600,
        'path'     => '/admin/',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function require_csrf(): void {
    $header = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    if (strtolower($header) !== 'fetch' && strtolower($header) !== 'xmlhttprequest') {
        send_json(403, ['error' => 'Missing CSRF request header']);
    }
}

function normalize_route(string $route): string {
    $r = trim($route);
    if ($r === '' || $r === '/') {
        return '/';
    }
    $r = '/' . trim($r, '/') . '/';
    return preg_replace('#/+#', '/', $r) ?? '/';
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';
$auth   = get_auth_data();

// 1. Setup & Auth Status
if ($action === 'status') {
    $isAuthed = verify_session($auth);
    send_json(200, [
        'needsSetup'    => empty($auth['initialized']),
        'authenticated' => $isAuthed,
        'adminEmail'    => $isAuthed ? ($auth['email'] ?? '') : '',
    ]);
}

// 2. First-Run Setup
if ($action === 'setup') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    if (!empty($auth['initialized'])) send_json(409, ['error' => 'Admin is already initialized']);

    $input = json_decode((string) file_get_contents('php://input'), true) ?? [];
    $email = filter_var(trim((string) ($input['email'] ?? '')), FILTER_VALIDATE_EMAIL);
    $password = trim((string) ($input['password'] ?? ''));

    if (!$email) send_json(400, ['error' => 'Valid admin email address is required']);
    if (strlen($password) < 10) send_json(400, ['error' => 'Password must be at least 10 characters long']);

    $secret = bin2hex(random_bytes(32));
    $auth = [
        'initialized'   => true,
        'email'         => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'secret'        => $secret,
        'created_at'    => date('c'),
    ];
    if (!save_auth_data($auth)) {
        send_json(500, ['error' => 'Failed to save admin credentials. Ensure admin/api/ is writable.']);
    }
    issue_session_cookie($secret);
    send_json(200, ['success' => true, 'message' => 'Admin account created']);
}

// 3. Login
if ($action === 'login') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    if (empty($auth['initialized'])) send_json(409, ['error' => 'Initial setup required']);

    $input = json_decode((string) file_get_contents('php://input'), true) ?? [];
    $email = strtolower(trim((string) ($input['email'] ?? '')));
    $password = (string) ($input['password'] ?? '');

    if (!empty($auth['email']) && $email !== strtolower((string) $auth['email'])) {
        usleep(400000);
        send_json(401, ['error' => 'Invalid email or password']);
    }
    if (!password_verify($password, (string) ($auth['password_hash'] ?? ''))) {
        usleep(400000);
        send_json(401, ['error' => 'Invalid email or password']);
    }

    issue_session_cookie((string) $auth['secret']);
    send_json(200, ['success' => true, 'message' => 'Signed in']);
}

// 4. Logout
if ($action === 'logout') {
    clear_session_cookie();
    send_json(200, ['success' => true, 'message' => 'Signed out']);
}

// Protected API Boundary
if (!verify_session($auth)) {
    send_json(401, ['error' => 'Authentication required']);
}

// 5. Global Site Settings
if ($action === 'get_settings') {
    $settings = file_exists($SETTINGS_FILE) ? (json_decode((string) file_get_contents($SETTINGS_FILE), true) ?? []) : [];
    $defaults = [
        'siteName'     => 'My Website',
        'phone'        => '+1 (555) 000-0000',
        'email'        => 'hello@example.com',
        'announcement' => 'Welcome — announcements & offers appear here.',
        'ctaLabel'     => 'Get Started',
        'ctaUrl'       => '/contact/',
        'logoUrl'      => '',
        'address'      => '123 Main Street, Suite 100',
        'hours'        => 'Mon–Fri 9:00 AM – 5:00 PM',
    ];
    send_json(200, ['settings' => array_merge($defaults, $settings)]);
}

if ($action === 'save_settings') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    $input = json_decode((string) file_get_contents('php://input'), true) ?? [];
    if (!isset($input['settings']) || !is_array($input['settings'])) {
        send_json(400, ['error' => 'Invalid settings payload']);
    }

    $sanitized = [];
    foreach ($input['settings'] as $k => $v) {
        $sanitized[strip_tags((string) $k)] = strip_tags(trim((string) $v));
    }
    $sanitized['updated_at'] = date('c');

    @file_put_contents($SETTINGS_FILE, json_encode($sanitized, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
    @file_put_contents($PUBLIC_OVERRIDES, json_encode($sanitized, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
    send_json(200, ['success' => true, 'message' => 'Global settings saved live']);
}

// 6. All-Pages Content & SEO Manager
if ($action === 'get_pages') {
    $pages = file_exists($PAGES_FILE) ? (json_decode((string) file_get_contents($PAGES_FILE), true) ?? []) : [];
    send_json(200, ['pages' => $pages]);
}

if ($action === 'save_page') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    $input = json_decode((string) file_get_contents('php://input'), true) ?? [];
    $route = normalize_route((string) ($input['route'] ?? ''));

    if (strlen($route) > 200) {
        send_json(400, ['error' => 'Route path is too long']);
    }

    $pages = file_exists($PAGES_FILE) ? (json_decode((string) file_get_contents($PAGES_FILE), true) ?? []) : [];
    $entry = [
        'route'           => $route,
        'seoTitle'        => strip_tags(trim((string) ($input['seoTitle'] ?? ''))),
        'seoDescription'  => strip_tags(trim((string) ($input['seoDescription'] ?? ''))),
        'heroHeading'     => strip_tags(trim((string) ($input['heroHeading'] ?? ''))),
        'heroSubheading'  => strip_tags(trim((string) ($input['heroSubheading'] ?? ''))),
        'heroImage'       => strip_tags(trim((string) ($input['heroImage'] ?? ''))),
        'ctaText'         => strip_tags(trim((string) ($input['ctaText'] ?? ''))),
        'ctaLink'         => strip_tags(trim((string) ($input['ctaLink'] ?? ''))),
        'bannerNotice'    => strip_tags(trim((string) ($input['bannerNotice'] ?? ''))),
        'updated_at'      => date('c'),
    ];

    $pages[$route] = $entry;
    @file_put_contents($PAGES_FILE, json_encode($pages, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
    @file_put_contents($PUBLIC_PAGES, json_encode($pages, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);

    send_json(200, ['success' => true, 'route' => $route, 'page' => $entry]);
}

if ($action === 'delete_page') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    $input = json_decode((string) file_get_contents('php://input'), true) ?? [];
    $route = normalize_route((string) ($input['route'] ?? ''));

    $pages = file_exists($PAGES_FILE) ? (json_decode((string) file_get_contents($PAGES_FILE), true) ?? []) : [];
    unset($pages[$route]);
    @file_put_contents($PAGES_FILE, json_encode($pages, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
    @file_put_contents($PUBLIC_PAGES, json_encode($pages, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);

    send_json(200, ['success' => true, 'route' => $route]);
}

// 7. Media Library (List, Upload, Delete)
if ($action === 'list_media') {
    $images = [];
    if (is_dir($UPLOAD_DIR)) {
        foreach (scandir($UPLOAD_DIR) as $f) {
            if ($f === '.' || $f === '..' || is_dir($UPLOAD_DIR . '/' . $f)) continue;
            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'avif', 'svg', 'gif'], true)) {
                $full = $UPLOAD_DIR . '/' . $f;
                $images[] = [
                    'name' => $f,
                    'url'  => '/assets/uploads/' . $f,
                    'size' => filesize($full),
                    'date' => date('Y-m-d H:i:s', filemtime($full)),
                ];
            }
        }
    }
    usort($images, fn($a, $b) => strcmp($b['date'], $a['date']));
    send_json(200, ['media' => $images]);
}

if ($action === 'upload_media') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    if (!isset($_FILES['file'])) send_json(400, ['error' => 'No file uploaded']);

    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) send_json(400, ['error' => 'Upload failed with code ' . $file['error']]);
    if ($file['size'] > MAX_UPLOAD_MB * 1024 * 1024) send_json(400, ['error' => 'File exceeds ' . MAX_UPLOAD_MB . 'MB limit']);

    $allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'svg', 'gif'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExts, true)) {
        send_json(400, ['error' => 'Unsupported format. Allowed: JPG, PNG, WebP, AVIF, SVG, GIF']);
    }

    // Verify real image MIME when fileinfo is available (excluding SVG text)
    if ($ext !== 'svg' && function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : '';
        if ($finfo) finfo_close($finfo);
        if (!str_starts_with((string) $mime, 'image/')) {
            send_json(400, ['error' => 'File content does not match a valid image']);
        }
    }

    if (!is_dir($UPLOAD_DIR)) {
        @mkdir($UPLOAD_DIR, 0755, true);
    }

    $slug = preg_replace('/[^a-z0-9]+/i', '-', pathinfo($file['name'], PATHINFO_FILENAME));
    $slug = trim(strtolower((string) $slug), '-') ?: 'upload';
    $filename = substr($slug, 0, 60) . '-' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
    $target = $UPLOAD_DIR . '/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $target)) {
        send_json(500, ['error' => 'Unable to store uploaded image']);
    }

    send_json(200, [
        'success'  => true,
        'filename' => $filename,
        'url'      => '/assets/uploads/' . $filename,
    ]);
}

if ($action === 'delete_media') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    $input = json_decode((string) file_get_contents('php://input'), true) ?? [];
    $name = basename((string) ($input['name'] ?? ''));
    if ($name === '' || $name === '.' || $name === '..') {
        send_json(400, ['error' => 'Invalid filename']);
    }
    $target = $UPLOAD_DIR . '/' . $name;
    if (!is_file($target)) {
        send_json(404, ['error' => 'File not found']);
    }
    if (!@unlink($target)) {
        send_json(500, ['error' => 'Failed to delete file']);
    }
    send_json(200, ['success' => true, 'name' => $name]);
}

// 8. Change Password
if ($action === 'change_password') {
    if ($method !== 'POST') send_json(405, ['error' => 'Method Not Allowed']);
    require_csrf();
    $input = json_decode((string) file_get_contents('php://input'), true) ?? [];
    $current = (string) ($input['currentPassword'] ?? '');
    $newPass = trim((string) ($input['newPassword'] ?? ''));

    if (!password_verify($current, (string) $auth['password_hash'])) {
        send_json(401, ['error' => 'Current password incorrect']);
    }
    if (strlen($newPass) < 10) {
        send_json(400, ['error' => 'New password must be at least 10 characters']);
    }

    $auth['password_hash'] = password_hash($newPass, PASSWORD_DEFAULT);
    $auth['secret'] = bin2hex(random_bytes(32));
    save_auth_data($auth);
    issue_session_cookie($auth['secret']);
    send_json(200, ['success' => true, 'message' => 'Password updated and old sessions invalidated']);
}

send_json(404, ['error' => 'Unknown API action']);
