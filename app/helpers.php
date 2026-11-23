<?php

declare(strict_types=1);

const MONTH_NAMES = [
    1 => 'January', 2 => 'February', 3 => 'March', 4 => 'April', 5 => 'May', 6 => 'June',
    7 => 'July', 8 => 'August', 9 => 'September', 10 => 'October', 11 => 'November', 12 => 'December',
];

/** Escape any value for HTML output. Use it on every echo. */
function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function is_api_request(): bool
{
    return defined('IS_API') && IS_API === true;
}

/** Sends a JSON response in the shape { ok: true, data } and stops. */
function json_ok(mixed $data = null, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Sends a JSON error in the shape { ok: false, error } and stops. */
function json_error(string $message, int $status = 400, array $extra = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => $message] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Only allow the listed HTTP methods on an endpoint. */
function require_method(string ...$methods): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        is_api_request() ? json_error('Method not allowed.', 405) : abort_page(405);
    }
}

/** Reads a JSON request body (max 2 MB) into an array. */
function read_json_body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 2 * 1024 * 1024 + 1);
    if ($raw === false || $raw === '') {
        json_error('The request was empty.', 400);
    }
    if (strlen($raw) > 2 * 1024 * 1024) {
        json_error('The request is too large.', 413);
    }
    try {
        $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        json_error('The request was not valid JSON.', 400);
    }
    if (!is_array($data)) {
        json_error('The request was not valid JSON.', 400);
    }
    return $data;
}

function redirect(string $path): never
{
    header('Location: ' . $path, true, 303);
    exit;
}

/** Accepts only a simple local page such as "builder.php?uid=…" as a return address. */
function safe_next(?string $next, string $fallback = 'reports.php'): string
{
    $next = (string) $next;
    if ($next !== '' && preg_match('~^[a-z0-9_\-]+\.php(\?[A-Za-z0-9_=&%\-.]*)?$~', $next)) {
        return $next;
    }
    return $fallback;
}

function flash(string $type, string $message): void
{
    $_SESSION['flash'][] = ['type' => $type, 'message' => $message];
}

function take_flashes(): array
{
    $messages = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $messages;
}

function abort_page(int $status, string $message = ''): never
{
    http_response_code($status);
    $titles = [
        400 => 'Bad request', 403 => 'You don’t have access to this page', 404 => 'Page not found',
        405 => 'Not allowed', 419 => 'Your session expired', 500 => 'Something went wrong',
    ];
    $title = $titles[$status] ?? 'Error';
    $message = $message !== '' ? $message : match ($status) {
        403 => 'This page is for the Admin only. Ask Ms. Jeah if you need access.',
        404 => 'The page or report you were looking for doesn’t exist.',
        419 => 'Please go back, refresh the page and try again.',
        default => 'Please try again. If it keeps happening, tell the Admin.',
    };
    require APP_ROOT . '/app/views/error.php';
    exit;
}

function random_token(int $bytes = 16): string
{
    return bin2hex(random_bytes($bytes));
}

/** Public id used in URLs and the browser, e.g. r_3f9c0a1b2c4d5e6f */
function new_report_uid(): string
{
    return 'r_' . random_token(8);
}

function clean_text(mixed $value, int $maxLength): string
{
    $text = is_scalar($value) ? (string) $value : '';
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    return mb_substr(trim($text), 0, $maxLength);
}

function clean_line(mixed $value, int $maxLength): string
{
    return str_replace("\n", ' ', clean_text($value, $maxLength));
}

function valid_email(string $email): bool
{
    return strlen($email) <= 150 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/** Only http(s) links are allowed anywhere in a report. */
function clean_url(mixed $value): string
{
    $url = clean_line($value, 2000);
    if ($url === '') {
        return '';
    }
    if (!preg_match('~^https?://~i', $url)) {
        // People often paste "drive.google.com/…" without the scheme.
        if (preg_match('~^[a-z0-9.-]+\.[a-z]{2,}(/|$)~i', $url)) {
            $url = 'https://' . $url;
        } else {
            return '';
        }
    }
    return filter_var($url, FILTER_VALIDATE_URL) !== false ? $url : '';
}

function clean_date(mixed $value): string
{
    $date = is_string($value) ? trim($value) : '';
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) {
        return '';
    }
    return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $date : '';
}

function log_error(string $message, array $context = []): void
{
    $line = '[' . date('c') . '] ' . $message;
    if ($context) {
        $line .= ' ' . json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
    $file = APP_ROOT . '/storage/logs/app-' . date('Y-m') . '.log';
    @file_put_contents($file, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}

/** Generates a readable temporary password like "Kite-4821-Mango". */
function temporary_password(): string
{
    $words = ['Mango', 'River', 'Coral', 'Cedar', 'Pearl', 'Lotus', 'Orbit', 'Maple', 'Tiger', 'Cloud', 'Kite', 'Sunny'];
    return $words[random_int(0, count($words) - 1)] . '-' . random_int(1000, 9999) . '-' . $words[random_int(0, count($words) - 1)];
}

/** "1 report", "3 reports", "0 clients". */
function count_label(int $count, string $noun): string
{
    return $count . ' ' . $noun . ($count === 1 ? '' : 's');
}
