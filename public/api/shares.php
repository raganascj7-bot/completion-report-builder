<?php

declare(strict_types=1);

/*
 * Sharing a report or a template with team members. JSON body { action, type, … }:
 *   list    { type, id }                       who has it, and who it can be shared with
 *   add     { type, id, userIds[], note }      share (again) + email each person
 *   remove  { type, id, userId }               stop sharing with one person
 * Reports: anyone signed in may share (Editors already see every report).
 * Templates: Admin only — sharing one lets that Editor edit it.
 */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$user = require_login();
verify_csrf();
$body = read_json_body();
$action = (string) ($body['action'] ?? '');
$type = (string) ($body['type'] ?? '');
if (!in_array($type, SHARE_TYPES, true)) {
    json_error('Unknown item.', 422);
}
if ($type === 'template' && $user['role'] !== 'admin') {
    json_error('Only an Admin can share templates.', 403);
}

// The item, its title and the link that opens it.
if ($type === 'report') {
    $item = report_by_uid((string) ($body['id'] ?? ''));
    if (!$item) {
        json_error('This report no longer exists.', 404);
    }
    $itemId = (int) $item['id'];
    $title = $item['client_name'] . ' · ' . MONTH_NAMES[(int) $item['month']] . ' ' . $item['year'];
    $path = 'builder.php?uid=' . $item['report_uid'];
} else {
    $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
    $item = $id ? template_by_id($id) : null;
    if (!$item) {
        json_error('This template no longer exists.', 404);
    }
    $itemId = (int) $item['id'];
    $title = $item['name'];
    $path = (($item['kind'] ?? 'theme') === 'layout' ? 'template-layout.php?id=' : 'template-edit.php?id=') . $itemId;
}

function share_state(string $type, int $itemId, array $user): array
{
    $people = array_map(static fn(array $row) => ['id' => (int) $row['id'], 'name' => $row['name'], 'email' => $row['email'], 'role' => $row['role']],
        db_all('SELECT id, name, email, role FROM users WHERE is_active = 1 AND id <> ? ORDER BY name', [$user['id']]));
    // Admins can already edit templates: only Editors are worth sharing a template with.
    if ($type === 'template') {
        $people = array_values(array_filter($people, static fn(array $person) => $person['role'] === 'editor'));
    }
    return ['shares' => shares_for($type, $itemId), 'people' => $people, 'mailEnabled' => mail_enabled()];
}

switch ($action) {
    case 'list':
        json_ok(share_state($type, $itemId, $user));

    case 'add':
        $note = clean_text($body['note'] ?? '', 500);
        $ids = array_values(array_unique(array_filter(array_map(
            static fn($value) => filter_var($value, FILTER_VALIDATE_INT),
            is_array($body['userIds'] ?? null) ? array_slice($body['userIds'], 0, 50) : []
        ))));
        if (!$ids) {
            json_error('Choose at least one person.', 422);
        }
        $emailed = 0;
        $link = app_link($path);
        foreach ($ids as $personId) {
            $person = db_one('SELECT id, name, email, role FROM users WHERE id = ? AND is_active = 1', [$personId]);
            if (!$person || (int) $person['id'] === $user['id']) {
                continue;
            }
            // Sharing again refreshes the note and shows it as new.
            if (db_one('SELECT id FROM shares WHERE item_type = ? AND item_id = ? AND user_id = ?', [$type, $itemId, $person['id']])) {
                db_run('UPDATE shares SET note = ?, shared_by = ?, created_at = ?, seen_at = NULL WHERE item_type = ? AND item_id = ? AND user_id = ?',
                    [$note, $user['id'], now(), $type, $itemId, $person['id']]);
            } else {
                db_run('INSERT INTO shares (item_type, item_id, user_id, shared_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [$type, $itemId, $person['id'], $user['id'], $note, now()]);
            }
            if (send_share_mail($person, $user['name'], $type, $title, $note, $link)) {
                $emailed++;
            }
        }
        json_ok(share_state($type, $itemId, $user) + ['emailed' => $emailed]);

    case 'remove':
        $personId = filter_var($body['userId'] ?? null, FILTER_VALIDATE_INT);
        db_run('DELETE FROM shares WHERE item_type = ? AND item_id = ? AND user_id = ?', [$type, $itemId, $personId ?: 0]);
        json_ok(share_state($type, $itemId, $user));

    default:
        json_error('Unknown action.', 400);
}
