<?php

declare(strict_types=1);

/**
 * Cross-site request forgery protection.
 * Forms send the token as a hidden "csrf_token" field; fetch() sends it
 * in the "X-CSRF-Token" header (see assets/js/lib/api.js).
 */
function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = random_token(32);
    }
    return $_SESSION['csrf_token'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

function verify_csrf(): void
{
    $sent = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!is_string($sent) || $expected === '' || !hash_equals($expected, $sent)) {
        is_api_request()
            ? json_error('Your session expired. Refresh the page and try again.', 419)
            : abort_page(419);
    }
}
