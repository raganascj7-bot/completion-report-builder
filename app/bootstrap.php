<?php

declare(strict_types=1);

/*
 * Every page and API endpoint starts with:
 *     require __DIR__ . '/../app/bootstrap.php';        (pages)
 *     require __DIR__ . '/../../app/bootstrap.php';     (api/)
 * It loads settings, opens the session safely and sets error handling.
 */

define('APP_ROOT', dirname(__DIR__));
define('STORAGE_PATH', APP_ROOT . '/storage');
define('UPLOAD_PATH', STORAGE_PATH . '/uploads');

require APP_ROOT . '/app/config.php';
require APP_ROOT . '/app/helpers.php';
require APP_ROOT . '/app/db.php';
require APP_ROOT . '/app/csrf.php';
require APP_ROOT . '/app/auth.php';
require APP_ROOT . '/app/reports.php';
require APP_ROOT . '/app/images.php';
require APP_ROOT . '/app/templates.php';
require APP_ROOT . '/app/layouts.php';
require APP_ROOT . '/app/shares.php';
require APP_ROOT . '/app/mailer.php';
require APP_ROOT . '/app/openai.php';
require APP_ROOT . '/app/views/layout.php';

date_default_timezone_set((string) config('APP_TIMEZONE', 'Asia/Manila'));
mb_internal_encoding('UTF-8');

$debug = config('APP_DEBUG', false) === true;
ini_set('display_errors', $debug ? '1' : '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

set_exception_handler(static function (Throwable $error): void {
    log_error($error->getMessage(), ['file' => $error->getFile(), 'line' => $error->getLine()]);
    if (config('APP_DEBUG', false) === true) {
        // Developers see the real error; users never do.
        http_response_code(500);
        echo '<pre>' . e((string) $error) . '</pre>';
        return;
    }
    if (is_api_request()) {
        json_error('Something went wrong on the server. Please try again.', 500);
    }
    abort_page(500);
});

// Basic security headers for every response.
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

session_name('crb_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_start();

// Sign out after a period of inactivity.
$idleLimit = config_int('SESSION_IDLE_MINUTES', 240) * 60;
if (isset($_SESSION['user_id'], $_SESSION['last_activity']) && time() - (int) $_SESSION['last_activity'] > $idleLimit) {
    logout_user();
    session_start();
}
if (isset($_SESSION['user_id'])) {
    $_SESSION['last_activity'] = time();
}
