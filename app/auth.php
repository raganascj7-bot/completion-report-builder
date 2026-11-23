<?php

declare(strict_types=1);

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;

/**
 * The signed-in user, re-read from the database on every request so a
 * deactivated account or a changed role takes effect immediately.
 */
function current_user(): ?array
{
    static $loaded = false;
    static $user = null;
    if ($loaded) {
        return $user;
    }
    $loaded = true;

    $id = $_SESSION['user_id'] ?? null;
    if (!is_int($id)) {
        return null;
    }
    $row = db_one(
        'SELECT id, name, email, role, is_active, must_change_password FROM users WHERE id = ?',
        [$id]
    );
    if (!$row || (int) $row['is_active'] !== 1) {
        logout_user();
        return null;
    }
    $row['id'] = (int) $row['id'];
    $row['must_change_password'] = (int) $row['must_change_password'] === 1;
    $user = $row;
    return $user;
}

function is_admin(): bool
{
    return (current_user()['role'] ?? '') === 'admin';
}

function require_login(): array
{
    $user = current_user();
    if (!$user) {
        if (is_api_request()) {
            json_error('Your session has ended. Please sign in again.', 401);
        }
        $here = basename($_SERVER['SCRIPT_NAME'] ?? 'reports.php');
        $query = $_SERVER['QUERY_STRING'] ?? '';
        redirect('login.php?next=' . rawurlencode($here . ($query !== '' ? '?' . $query : '')));
    }

    // A new or reset account must choose its own password first.
    $page = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if ($user['must_change_password'] && !in_array($page, ['account.php', 'logout.php'], true)) {
        is_api_request()
            ? json_error('Please change your temporary password first.', 403)
            : redirect('account.php');
    }
    return $user;
}

function require_admin(): array
{
    $user = require_login();
    if ($user['role'] !== 'admin') {
        is_api_request() ? json_error('Only the Admin can do this.', 403) : abort_page(403);
    }
    return $user;
}

/**
 * Checks email + password. Returns the user row on success or an error
 * message. Messages never reveal whether the email exists.
 *
 * @return array{user: ?array, error: ?string}
 */
function attempt_login(string $email, string $password): array
{
    $generic = 'Incorrect email or password.';
    $user = db_one('SELECT * FROM users WHERE email = ?', [mb_strtolower($email)]);

    if (!$user) {
        // Spend the same time as a real check so timing reveals nothing.
        password_verify($password, '$2y$10$MaAEl82iwlXdbp6bExgwHebqBoux04x.UjsNneuc6N7fYAj/LWHFG');
        return ['user' => null, 'error' => $generic];
    }

    if ($user['locked_until'] !== null && strtotime((string) $user['locked_until']) > time()) {
        return ['user' => null, 'error' => 'Too many failed attempts. Try again in ' . LOCKOUT_MINUTES . ' minutes.'];
    }

    if (!password_verify($password, (string) $user['password_hash'])) {
        $failed = (int) $user['failed_logins'] + 1;
        $lockedUntil = $failed >= MAX_FAILED_LOGINS ? date('Y-m-d H:i:s', time() + LOCKOUT_MINUTES * 60) : null;
        db_run(
            'UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?',
            [$lockedUntil ? 0 : $failed, $lockedUntil, $user['id']]
        );
        return [
            'user' => null,
            'error' => $lockedUntil ? 'Too many failed attempts. Try again in ' . LOCKOUT_MINUTES . ' minutes.' : $generic,
        ];
    }

    if ((int) $user['is_active'] !== 1) {
        return ['user' => null, 'error' => 'This account has been deactivated. Contact the Admin.'];
    }

    if (password_needs_rehash((string) $user['password_hash'], PASSWORD_DEFAULT)) {
        db_run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }
    db_run(
        'UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?',
        [now(), $user['id']]
    );
    return ['user' => $user, 'error' => null];
}

function login_user(array $user): void
{
    session_regenerate_id(true);
    $_SESSION = [];
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['last_activity'] = time();
    csrf_token();
}

function logout_user(): void
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_destroy();
    }
}

/** Returns an error message, or null when the new password is acceptable. */
function password_problem(string $password, string $confirm): ?string
{
    if (mb_strlen($password) < MIN_PASSWORD_LENGTH) {
        return 'Use at least ' . MIN_PASSWORD_LENGTH . ' characters.';
    }
    if (mb_strlen($password) > 200) {
        return 'That password is too long.';
    }
    if ($password !== $confirm) {
        return 'The two passwords don’t match.';
    }
    return null;
}

/* ---------- Invitations: a one-time link to choose a password ---------- */

const INVITE_HOURS = 48;

/** Creates a fresh invitation for a member and returns its link (the old link stops working). */
function create_invitation(int $userId): string
{
    $token = random_token(32);
    db_run(
        'UPDATE users SET invite_token_hash = ?, invite_expires_at = ?, invited_at = ?, updated_at = ? WHERE id = ?',
        [hash('sha256', $token), date('Y-m-d H:i:s', time() + INVITE_HOURS * 3600), now(), now(), $userId]
    );
    return app_link('invite.php?token=' . $token);
}

/** The member a still-valid invitation link belongs to, or null. */
function find_invitation(string $token): ?array
{
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $user = db_one('SELECT * FROM users WHERE invite_token_hash = ?', [hash('sha256', $token)]);
    if (!$user || (int) $user['is_active'] !== 1 || strtotime((string) $user['invite_expires_at']) < time()) {
        return null;
    }
    return $user;
}

function accept_invitation(array $user, string $password): void
{
    db_run(
        'UPDATE users SET password_hash = ?, must_change_password = 0, invite_token_hash = NULL, invite_expires_at = NULL,
             failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
        [password_hash($password, PASSWORD_DEFAULT), now(), $user['id']]
    );
}
