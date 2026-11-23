<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$admin = require_admin();
verify_csrf();
$body = read_json_body();
$action = (string) ($body['action'] ?? '');

function active_admin_count(): int
{
    return (int) (db_one("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND is_active = 1")['total'] ?? 0);
}

function find_member(mixed $id): array
{
    $id = filter_var($id, FILTER_VALIDATE_INT);
    $member = $id ? db_one('SELECT * FROM users WHERE id = ?', [$id]) : null;
    if (!$member) {
        json_error('Team member not found.', 404);
    }
    return $member;
}

function validated_member_fields(array $body, ?int $exceptId = null): array
{
    $name = clean_line($body['name'] ?? '', 100);
    $email = mb_strtolower(clean_line($body['email'] ?? '', 150));
    $role = ($body['role'] ?? '') === 'admin' ? 'admin' : 'editor';
    $rawName = is_string($body['name'] ?? null) ? trim($body['name']) : '';

    if ($name === '') {
        json_error('Enter a name.', 422, ['field' => 'name']);
    }
    if (mb_strlen($rawName) > 100) {
        json_error('Names can be at most 100 characters.', 422, ['field' => 'name']);
    }
    if (!valid_email($email)) {
        json_error('Enter a valid email address, like name@example.com.', 422, ['field' => 'email']);
    }
    $taken = db_one('SELECT id FROM users WHERE email = ?' . ($exceptId ? ' AND id <> ?' : ''), $exceptId ? [$email, $exceptId] : [$email]);
    if ($taken) {
        json_error('That email is already registered.', 422, ['field' => 'email']);
    }
    return [$name, $email, $role];
}

switch ($action) {
    case 'create':
        // The new member gets an email with a link to choose their own password.
        [$name, $email, $role] = validated_member_fields($body);
        db_run(
            'INSERT INTO users (name, email, password_hash, role, is_active, must_change_password, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, 0, ?, ?)',
            [$name, $email, password_hash(random_token(32), PASSWORD_DEFAULT), $role, now(), now()]
        );
        $member = db_one('SELECT * FROM users WHERE id = ?', [(int) db()->lastInsertId()]);
        $link = create_invitation((int) $member['id']);
        $sent = send_invitation_mail($member, $link, $admin['name']);
        json_ok(['name' => $name, 'email' => $email, 'emailSent' => $sent, 'mailEnabled' => mail_enabled(), 'inviteLink' => $link], 201);

    case 'invite':
        // A new invitation link (the old one stops working), by email when possible.
        $member = find_member($body['id'] ?? null);
        if ((int) $member['is_active'] !== 1) {
            json_error('Reactivate this account first.', 422);
        }
        $link = create_invitation((int) $member['id']);
        $sent = send_invitation_mail($member, $link, $admin['name']);
        json_ok(['name' => $member['name'], 'email' => $member['email'], 'emailSent' => $sent, 'mailEnabled' => mail_enabled(), 'inviteLink' => $link]);

    case 'update':
        $member = find_member($body['id'] ?? null);
        [$name, $email, $role] = validated_member_fields($body, (int) $member['id']);
        if ((int) $member['id'] === $admin['id'] && $role !== 'admin') {
            json_error('You can’t remove your own Admin role.', 422);
        }
        db_run(
            'UPDATE users SET name = ?, email = ?, role = ?, updated_at = ? WHERE id = ?',
            [$name, $email, $role, now(), $member['id']]
        );
        json_ok(['updated' => true]);

    case 'reset':
        $member = find_member($body['id'] ?? null);
        if ((int) $member['id'] === $admin['id']) {
            json_error('Change your own password on the My account page.', 422);
        }
        $password = temporary_password();
        db_run(
            'UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
            [password_hash($password, PASSWORD_DEFAULT), now(), $member['id']]
        );
        json_ok(['temporaryPassword' => $password, 'name' => $member['name']]);

    case 'deactivate':
        $member = find_member($body['id'] ?? null);
        if ((int) $member['id'] === $admin['id']) {
            json_error('You can’t deactivate your own account.', 422);
        }
        if ($member['role'] === 'admin' && active_admin_count() <= 1) {
            json_error('At least one active Admin must remain.', 422);
        }
        db_run('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?', [now(), $member['id']]);
        json_ok(['updated' => true]);

    case 'activate':
        $member = find_member($body['id'] ?? null);
        db_run('UPDATE users SET is_active = 1, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [now(), $member['id']]);
        json_ok(['updated' => true]);

    default:
        json_error('Unknown action.', 400);
}
